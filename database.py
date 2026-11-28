import sqlite3

DB_FILE = "app.db"


def get_db():
    """Open a connection to the SQLite database."""
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row   # lets us use row["title"] instead of row[1]
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def country_counts():
    """{'Germany': 3, 'Canada': 1, ...} - used by the map."""
    conn = get_db()
    rows = conn.execute("SELECT country, COUNT(*) AS n FROM opportunities GROUP BY country").fetchall()
    conn.close()
    return {r["country"]: r["n"] for r in rows}
