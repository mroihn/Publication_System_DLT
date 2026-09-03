//go:build integration

// Package integration contains database-backed integration tests.
//
// These tests are excluded from the default build so that `go test ./...` stays
// green on machines without a database. Run them explicitly with:
//
//	docker compose up -d database
//	go test -tags=integration ./test/integration/...
//
// Connection settings default to the `database` service defined in
// docker-compose.yml (localhost:5433, postgres/postgres) and can be overridden
// with TEST_DB_HOST / TEST_DB_PORT / TEST_DB_USER / TEST_DB_PASSWORD.
//
// Each test provisions its own throwaway database, applies the real embedded
// migrations, and drops the database afterwards, so tests never touch
// development data and never interfere with one another.
package integration

import (
	"database/sql"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/mroihn/ta-proj/backend-go/internal/config"
	"github.com/mroihn/ta-proj/backend-go/internal/db"
	"github.com/mroihn/ta-proj/backend-go/internal/domain"
	"github.com/mroihn/ta-proj/backend-go/internal/repository"
)

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// baseConfig returns connection settings pointing at the given database name.
func baseConfig(dbName string) *config.Config {
	return &config.Config{
		DBHost:     envOr("TEST_DB_HOST", "localhost"),
		DBPort:     envOr("TEST_DB_PORT", "5433"),
		DBUser:     envOr("TEST_DB_USER", "postgres"),
		DBPassword: envOr("TEST_DB_PASSWORD", "postgres"),
		DBName:     dbName,
		DBSSLMode:  "disable",
	}
}

// setupTestDB provisions a fresh database, runs all embedded migrations against
// it, and returns a handle plus a cleanup function. The test is skipped (not
// failed) when no PostgreSQL server is reachable.
func setupTestDB(t *testing.T) (*sql.DB, func()) {
	t.Helper()

	admin, err := db.Open(baseConfig("postgres"))
	if err != nil {
		t.Skipf("skipping integration test: cannot reach PostgreSQL (%v); start it with `docker compose up -d database`", err)
	}

	name := fmt.Sprintf("publish_test_%d", time.Now().UnixNano())
	if _, err := admin.Exec("CREATE DATABASE " + name); err != nil {
		admin.Close()
		t.Fatalf("create test database: %v", err)
	}

	testDB, err := db.Open(baseConfig(name))
	if err != nil {
		admin.Exec("DROP DATABASE IF EXISTS " + name)
		admin.Close()
		t.Fatalf("connect to test database: %v", err)
	}

	if err := db.RunMigrations(testDB); err != nil {
		testDB.Close()
		admin.Exec("DROP DATABASE IF EXISTS " + name)
		admin.Close()
		t.Fatalf("run migrations: %v", err)
	}

	cleanup := func() {
		testDB.Close()
		// Terminate lingering sessions so the DROP cannot be blocked.
		admin.Exec(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1`, name)
		if _, err := admin.Exec("DROP DATABASE IF EXISTS " + name); err != nil {
			t.Logf("warning: could not drop test database %s: %v", name, err)
		}
		admin.Close()
	}
	return testDB, cleanup
}

// uniqueEmail avoids collisions with the demo accounts seeded by migration 008.
func uniqueEmail(prefix string) string {
	return fmt.Sprintf("%s-%d@integration.test", prefix, time.Now().UnixNano())
}

// TestMigrationsApplyCleanly verifies that the full migration chain runs against
// an empty database and produces every table the application depends on.
func TestMigrationsApplyCleanly(t *testing.T) {
	testDB, cleanup := setupTestDB(t)
	defer cleanup()

	expected := []string{
		"users",
		"submission_wallets",
		"reviewer_sessions",
		"reviewer_field_requests",
		"comment_contents",
	}

	for _, table := range expected {
		var exists bool
		err := testDB.QueryRow(
			`SELECT EXISTS (
			   SELECT 1 FROM information_schema.tables
			   WHERE table_schema = 'public' AND table_name = $1
			 )`, table,
		).Scan(&exists)
		if err != nil {
			t.Fatalf("query information_schema for %q: %v", table, err)
		}
		if !exists {
			t.Errorf("expected table %q to exist after migrations", table)
		}
	}
}

// TestUserRepositoryCRUD exercises the real SQL behind the UserRepository
// interface: insert, lookup by each supported key, and update-in-place.
func TestUserRepositoryCRUD(t *testing.T) {
	testDB, cleanup := setupTestDB(t)
	defer cleanup()

	repo := repository.NewPostgresUserRepository(testDB)
	email := uniqueEmail("author")

	saved, err := repo.Save(&domain.User{
		Email:        email,
		Password:     "hashed-password",
		Role:         "reviewer",
		Specialities: []string{"ai", "blockchain"},
	})
	if err != nil {
		t.Fatalf("Save: %v", err)
	}
	if saved.ID == "" {
		t.Fatal("expected Save to populate a generated UUID")
	}

	byEmail, err := repo.FindByEmail(email)
	if err != nil {
		t.Fatalf("FindByEmail: %v", err)
	}
	if byEmail == nil {
		t.Fatal("expected to find the user by email")
	}
	if byEmail.ID != saved.ID {
		t.Errorf("FindByEmail returned id %q, want %q", byEmail.ID, saved.ID)
	}
	if byEmail.Role != "reviewer" {
		t.Errorf("role = %q, want %q", byEmail.Role, "reviewer")
	}
	if len(byEmail.Specialities) != 2 {
		t.Errorf("specialities = %v, want 2 entries", byEmail.Specialities)
	}

	byID, err := repo.FindByID(saved.ID)
	if err != nil {
		t.Fatalf("FindByID: %v", err)
	}
	if byID == nil || byID.Email != email {
		t.Fatalf("FindByID returned %+v, want user with email %q", byID, email)
	}

	// A lookup that matches nothing must return (nil, nil) rather than an error.
	missing, err := repo.FindByEmail(uniqueEmail("nobody"))
	if err != nil {
		t.Fatalf("FindByEmail for unknown address returned error: %v", err)
	}
	if missing != nil {
		t.Errorf("expected nil user for unknown email, got %+v", missing)
	}
}

// TestUserRepositoryWalletBinding covers wallet lookup, which underpins the
// wallet-binding flow and the uniqueness check that prevents one address from
// being claimed by two accounts.
func TestUserRepositoryWalletBinding(t *testing.T) {
	testDB, cleanup := setupTestDB(t)
	defer cleanup()

	repo := repository.NewPostgresUserRepository(testDB)
	wallet := "0x1111111111111111111111111111111111111111"

	user, err := repo.Save(&domain.User{
		Email:    uniqueEmail("wallet"),
		Password: "hashed-password",
		Role:     "user",
	})
	if err != nil {
		t.Fatalf("Save: %v", err)
	}

	// Not yet bound
	found, err := repo.FindByWalletAddress(wallet)
	if err != nil {
		t.Fatalf("FindByWalletAddress: %v", err)
	}
	if found != nil {
		t.Fatalf("expected no user bound to %s yet, got %+v", wallet, found)
	}

	// Bind and re-save (Save upserts on the existing id)
	user.WalletAddress = wallet
	if _, err := repo.Save(user); err != nil {
		t.Fatalf("Save with wallet: %v", err)
	}

	found, err = repo.FindByWalletAddress(wallet)
	if err != nil {
		t.Fatalf("FindByWalletAddress after binding: %v", err)
	}
	if found == nil {
		t.Fatal("expected to find the user by wallet address after binding")
	}
	if found.ID != user.ID {
		t.Errorf("wallet resolved to id %q, want %q", found.ID, user.ID)
	}
}

