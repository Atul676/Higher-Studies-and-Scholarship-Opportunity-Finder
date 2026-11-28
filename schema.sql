-- Person B: opportunity catalogue used by search, details, and destination views.
DROP TABLE IF EXISTS opportunities;

CREATE TABLE opportunities (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    type             TEXT NOT NULL CHECK (type IN ('programme','scholarship','research')),
    title            TEXT NOT NULL,
    institution      TEXT NOT NULL,
    country          TEXT NOT NULL,
    degree_level     TEXT NOT NULL CHECK (degree_level IN ('Masters','PhD','Any')),
    subject          TEXT NOT NULL,
    description      TEXT,
    funding_type     TEXT NOT NULL DEFAULT 'None'
                     CHECK (funding_type IN ('Full','Partial','Tuition waiver','Stipend','None')),
    funding_amount   REAL,
    min_gpa_percent  REAL,
    min_english      REAL,
    eligible_countries TEXT,
    deadline         TEXT,
    official_url     TEXT NOT NULL
);
