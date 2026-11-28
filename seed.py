"""Creates the database tables and loads data/opportunities.csv.

Run once at the start, and again whenever the CSV changes:
    python seed.py
(This deletes and recreates all tables.)
"""
import csv
from database import get_db

COLUMNS = ["type", "title", "institution", "country", "degree_level", "subject",
           "description", "funding_type", "funding_amount", "min_gpa_percent",
           "min_english", "eligible_countries", "deadline", "official_url"]
NUMBER_COLUMNS = {"funding_amount", "min_gpa_percent", "min_english"}


def main():
    conn = get_db()
    with open("schema.sql", encoding="utf-8") as f:
        conn.executescript(f.read())

    count = 0
    with open("data/opportunities.csv", newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            values = []
            for col in COLUMNS:
                v = row[col].strip()
                if v == "":
                    v = None
                elif col in NUMBER_COLUMNS:
                    v = float(v)
                values.append(v)
            conn.execute(
                f"INSERT INTO opportunities ({', '.join(COLUMNS)}) "
                f"VALUES ({', '.join('?' * len(COLUMNS))})", values)
            count += 1

    conn.commit()
    conn.close()
    print(f"Done. Loaded {count} opportunities.")


if __name__ == "__main__":
    main()
