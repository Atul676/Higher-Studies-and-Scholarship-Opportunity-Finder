# StudyFinder — Postgraduate Opportunities

A Flask and SQLite app for finding postgraduate programmes, scholarships, and funded research positions. This contribution covers opportunity discovery, search, listing details, and destination maps. Account/profile and application/document features are separate teammate modules.

## Run locally

```powershell
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python seed.py
python app.py
```

Then open `http://127.0.0.1:5000`. `python seed.py` rebuilds the opportunity table from `data/opportunities.csv`.

## Opportunity discovery module

- Catalogue and seed logic: `data/opportunities.csv`, `seed.py`, `schema.sql`
- Home, search, details, and destination pages: `app.py`, `templates/`
- Map, globe, listing covers, and styles: `static/`

Check sample listings against official sources before presenting them as verified.
