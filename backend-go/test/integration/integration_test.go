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
		"categories",
		"journals",
		"manuscript_assignments",
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


// insertEditor creates an editor with a fixed set of verified categories.
func insertEditor(t *testing.T, testDB *sql.DB, email, fields string) string {
	t.Helper()
	var id string
	err := testDB.QueryRow(
		`INSERT INTO users (id, email, password_hash, role, verified_fields, updated_at)
		 VALUES (gen_random_uuid(), $1, 'x', 'editor', `+fields+`, NOW())
		 RETURNING id`, email,
	).Scan(&id)
	if err != nil {
		t.Fatalf("insert editor %s: %v", email, err)
	}
	return id
}

func journalID(t *testing.T, testDB *sql.DB, name string) *int64 {
	t.Helper()
	var id int64
	if err := testDB.QueryRow(`SELECT id FROM journals WHERE name = $1`, name).Scan(&id); err != nil {
		t.Fatalf("lookup journal %q: %v", name, err)
	}
	return &id
}

func assignedEditor(t *testing.T, testDB *sql.DB, msId uint64) string {
	t.Helper()
	var id string
	err := testDB.QueryRow(`SELECT assigned_editor_id FROM manuscript_assignments WHERE ms_id = $1`, msId).Scan(&id)
	if err == sql.ErrNoRows {
		return ""
	}
	if err != nil {
		t.Fatalf("read assignment for %d: %v", msId, err)
	}
	return id
}

// TestAssignEditorMatchesJournalCategory covers the automatic editor-assignment
// rule: prefer an editor whose verified fields cover the journal's category,
// fall back to any editor, and never reassign a manuscript that already has one.
func TestAssignEditorMatchesJournalCategory(t *testing.T) {
	testDB, cleanup := setupTestDB(t)
	defer cleanup()

	if _, err := testDB.Exec(`DELETE FROM users WHERE role = 'editor'`); err != nil {
		t.Fatalf("clear seeded editors: %v", err)
	}
	aiEditor := insertEditor(t, testDB, "ai-editor@test.local", `ARRAY['ai']`)
	secEditor := insertEditor(t, testDB, "sec-editor@test.local", `ARRAY['computer-security']`)

	if err := repository.AssignEditor(testDB, 1, journalID(t, testDB, "Journal of Applied AI")); err != nil {
		t.Fatalf("AssignEditor(1): %v", err)
	}
	if got := assignedEditor(t, testDB, 1); got != aiEditor {
		t.Errorf("ai manuscript: expected the ai editor %s, got %s", aiEditor, got)
	}

	if err := repository.AssignEditor(testDB, 2, journalID(t, testDB, "Journal of Data Science")); err != nil {
		t.Fatalf("AssignEditor(2): %v", err)
	}
	if got := assignedEditor(t, testDB, 2); got != aiEditor && got != secEditor {
		t.Errorf("unmatched manuscript: expected a fallback editor, got %q", got)
	}

	missing := int64(424242)
	if err := repository.AssignEditor(testDB, 3, &missing); err != nil {
		t.Fatalf("AssignEditor with unknown journal must fall back, not fail: %v", err)
	}
	if got := assignedEditor(t, testDB, 3); got == "" {
		t.Error("unknown journal id: expected a fallback editor to be assigned")
	}

	before := assignedEditor(t, testDB, 2)
	for i := 0; i < 5; i++ {
		if err := repository.AssignEditor(testDB, 2, nil); err != nil {
			t.Fatalf("re-AssignEditor(2): %v", err)
		}
	}
	if after := assignedEditor(t, testDB, 2); after != before {
		t.Errorf("reassigned on repeat: was %s, now %s", before, after)
	}
}

// TestAssignEditorWithoutEditorsLeavesUnassigned verifies that with no editor
// account nothing is stored, so the manuscript stays visible to every editor
// and gets assigned once an editor exists.
func TestAssignEditorWithoutEditorsLeavesUnassigned(t *testing.T) {
	testDB, cleanup := setupTestDB(t)
	defer cleanup()

	if _, err := testDB.Exec(`DELETE FROM users WHERE role = 'editor'`); err != nil {
		t.Fatalf("clear seeded editors: %v", err)
	}
	if err := repository.AssignEditor(testDB, 7, nil); err != nil {
		t.Fatalf("AssignEditor: %v", err)
	}
	if got := assignedEditor(t, testDB, 7); got != "" {
		t.Errorf("expected no assignment with zero editors, got %q", got)
	}

	editor := insertEditor(t, testDB, "late-editor@test.local", `ARRAY['ai']`)
	if err := repository.AssignEditor(testDB, 7, nil); err != nil {
		t.Fatalf("AssignEditor after editor added: %v", err)
	}
	if got := assignedEditor(t, testDB, 7); got != editor {
		t.Errorf("expected the newly added editor %s, got %q", editor, got)
	}
}
