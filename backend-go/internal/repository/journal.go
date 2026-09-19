package repository

import (
	"context"
	"database/sql"
)

type Journal struct {
	ID            int64  `json:"id"`
	Name          string `json:"name"`
	CategorySlug  string `json:"category_slug"`
	CategoryLabel string `json:"category_label"`
}

type JournalRepository struct {
	db *sql.DB
}

func NewJournalRepository(db *sql.DB) *JournalRepository {
	return &JournalRepository{db: db}
}

const journalSelect = `SELECT j.id, j.name, j.category_slug, c.label
	 FROM journals j JOIN categories c ON c.slug = j.category_slug`

func (r *JournalRepository) ListJournals(ctx context.Context) ([]Journal, error) {
	rows, err := r.db.QueryContext(ctx, journalSelect+` ORDER BY c.label, j.name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Journal{}
	for rows.Next() {
		var j Journal
		if err := rows.Scan(&j.ID, &j.Name, &j.CategorySlug, &j.CategoryLabel); err != nil {
			return nil, err
		}
		out = append(out, j)
	}
	return out, rows.Err()
}

func (r *JournalRepository) GetJournal(ctx context.Context, id int64) (*Journal, error) {
	var j Journal
	err := r.db.QueryRowContext(ctx, journalSelect+` WHERE j.id = $1`, id).
		Scan(&j.ID, &j.Name, &j.CategorySlug, &j.CategoryLabel)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &j, nil
}
