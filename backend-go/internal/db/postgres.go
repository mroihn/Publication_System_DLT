package db

import (
	"database/sql"
	_ "embed"
	"fmt"
	"time"

	_ "github.com/lib/pq"
	"github.com/mroihn/ta-proj/backend-go/internal/config"
)

//go:embed migrations/001_initial_schema.up.sql
var migration001 string

//go:embed migrations/002_processed_events_ms_id.up.sql
var migration002 string

//go:embed migrations/003_submit_timestamp.up.sql
var migration003 string

func Open(cfg *config.Config) (*sql.DB, error) {
	dsn := fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
		cfg.DBHost, cfg.DBPort, cfg.DBUser, cfg.DBPassword, cfg.DBName, cfg.DBSSLMode,
	)
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(10)
	db.SetConnMaxLifetime(5 * time.Minute)
	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("postgres ping failed: %w", err)
	}
	return db, nil
}

func RunMigrations(db *sql.DB) error {
	for _, sql := range []string{migration001, migration002, migration003} {
		if _, err := db.Exec(sql); err != nil {
			return err
		}
	}
	return nil
}
