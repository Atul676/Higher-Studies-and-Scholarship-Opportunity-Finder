import json
import os
import re
import zlib
from datetime import date

from flask import Flask, abort, render_template, request

from database import country_counts, get_db

app = Flask(__name__)

PER_PAGE = 6
DATA_LAST_UPDATED = "27 Nov 2026"      # change when you edit the CSV


# ---------- small helpers used by templates ----------

# Country name (as written in the CSV and on the map) -> ISO 3166-1 alpha-2 code, used for flag images.
ISO = {
    "Afghanistan": "af", "Albania": "al", "Algeria": "dz", "Argentina": "ar", "Armenia": "am", "Australia": "au",
    "Austria": "at", "Azerbaijan": "az", "Bahrain": "bh", "Bangladesh": "bd", "Belarus": "by", "Belgium": "be",
    "Bhutan": "bt", "Bolivia": "bo", "Bosnia and Herz.": "ba", "Brazil": "br", "Bulgaria": "bg", "Cambodia": "kh",
    "Cameroon": "cm", "Canada": "ca", "Chile": "cl", "China": "cn", "Colombia": "co", "Costa Rica": "cr",
    "Croatia": "hr", "Cuba": "cu", "Cyprus": "cy", "Czechia": "cz", "Denmark": "dk", "Ecuador": "ec", "Egypt": "eg",
    "Estonia": "ee", "Ethiopia": "et", "Europe": "eu", "Finland": "fi", "France": "fr", "Georgia": "ge",
    "Germany": "de", "Ghana": "gh", "Greece": "gr", "Hungary": "hu", "Iceland": "is", "India": "in",
    "Indonesia": "id", "Iran": "ir", "Iraq": "iq", "Ireland": "ie", "Israel": "il", "Italy": "it",
    "Japan": "jp", "Jordan": "jo", "Kazakhstan": "kz", "Kenya": "ke", "Kuwait": "kw", "Latvia": "lv",
    "Lebanon": "lb", "Lithuania": "lt", "Luxembourg": "lu", "Malaysia": "my", "Malta": "mt", "Mexico": "mx",
    "Morocco": "ma", "Myanmar": "mm", "Nepal": "np", "Netherlands": "nl", "New Zealand": "nz", "Nigeria": "ng",
    "North Korea": "kp", "Norway": "no", "Oman": "om", "Pakistan": "pk", "Peru": "pe", "Philippines": "ph",
    "Poland": "pl", "Portugal": "pt", "Qatar": "qa", "Romania": "ro", "Russia": "ru", "Saudi Arabia": "sa",
    "Serbia": "rs", "Singapore": "sg", "Slovakia": "sk", "Slovenia": "si", "South Africa": "za",
    "South Korea": "kr", "Spain": "es", "Sri Lanka": "lk", "Sweden": "se", "Switzerland": "ch", "Taiwan": "tw",
    "Tanzania": "tz", "Thailand": "th", "Tunisia": "tn", "Turkey": "tr", "Uganda": "ug", "Ukraine": "ua",
    "United Arab Emirates": "ae", "United Kingdom": "gb", "United States": "us", "Uruguay": "uy",
    "Uzbekistan": "uz", "Vietnam": "vn", "Zambia": "zm", "Zimbabwe": "zw",
}


def flag_url(country, width=80):
    """Flag image from flagcdn.com. width must be one of 20, 40, 80, 160, 320, 640."""
    code = ISO.get(country)
    return f"https://flagcdn.com/w{width}/{code}.png" if code else None


# data/university_images.json: institution -> {"image": official photo URL, "wiki": Wikipedia article title}
try:
    with open(os.path.join(app.root_path, "data", "university_images.json"), encoding="utf-8") as f:
        IMAGE_SOURCES = json.load(f)
except (OSError, ValueError):
    IMAGE_SOURCES = {}

def slugify(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def cover_for(name, url=None, country=None):
    """Cover for a card, best source first:
    1. your own photo in static/img/universities/<name-slug>.jpg
    2. an official-website photo URL in data/university_images.json ("image")
    3. a Wikipedia lead photo and then a live preview of the official site (both loaded by static/app.js)
    4. the country flag with the institution's initials."""
    slug = slugify(name)
    src = IMAGE_SOURCES.get(name, {})
    cover = {"image": None, "official": src.get("image") or None, "wiki": src.get("wiki") or "",
             "site": url or "", "flag": flag_url(country, 320) if country else None,
             "flag_small": flag_url(country, 80) if country else None}
    for ext in ("jpg", "jpeg", "png", "webp"):
        rel = f"static/img/universities/{slug}.{ext}"
        if os.path.exists(os.path.join(app.root_path, rel)):
            cover["image"] = "/" + rel
            break
    words = [w for w in re.split(r"\W+", name) if w[:1].isupper() or w.isupper()]
    cover["initials"] = "".join(w[0] for w in words[:3]).upper() or name[:2].upper()
    cover["hue"] = zlib.crc32(name.encode()) % 360
    return cover


def days_left(deadline):
    """Whole days until the deadline, or None if there is none."""
    if not deadline:
        return None
    return (date.fromisoformat(deadline) - date.today()).days


def describe(text):
    """Hide the 'SAMPLE DATA' note in the CSV text and tell the template about it."""
    text = text or ""
    is_sample = "SAMPLE DATA" in text or "PLACEHOLDER" in text
    text = re.sub(r"\s*(SAMPLE DATA|PLACEHOLDER)\b.*$", "", text).strip()
    return text, is_sample


@app.context_processor
def inject_globals():
    return {"today": date.today().isoformat(), "data_updated": DATA_LAST_UPDATED,
            "cover_for": cover_for, "days_left": days_left, "describe": describe,
            "flag_url": flag_url, "flags": {c: flag_url(c, 80) for c in ISO}}


def counted(column, where=""):
    """[(value, how many listings)] for filter lists and the home page."""
    conn = get_db()
    rows = conn.execute(
        f"SELECT {column} AS v, COUNT(*) AS n FROM opportunities {where} "
        f"GROUP BY {column} ORDER BY n DESC, v").fetchall()
    conn.close()
    return [(r["v"], r["n"]) for r in rows]


# ---------- Person B: Home, Search, Detail ----------

@app.route("/")
def home():
    conn = get_db()
    closing = conn.execute(
        "SELECT * FROM opportunities WHERE deadline >= ? ORDER BY deadline LIMIT 5",
        (date.today().isoformat(),)).fetchall()
    total = conn.execute("SELECT COUNT(*) FROM opportunities").fetchone()[0]
    conn.close()
    type_counts = dict(counted("type"))
    return render_template(
        "index.html", total=total, type_counts=type_counts, closing=closing,
        subjects=counted("subject"), countries=counted("country"), counts_by_country=country_counts())


@app.route("/search")
def search():
    q = request.args.get("q", "").strip()
    opp_type = request.args.get("type", "")
    degree = request.args.get("degree", "")
    country = request.args.get("country", "")
    subject = request.args.get("subject", "")
    funding = request.args.get("funding", "")
    open_only = request.args.get("open_only", "")
    sort = request.args.get("sort", "deadline")
    page = max(1, request.args.get("page", 1, type=int))

    where, params = [], []
    if q:
        where.append("(title LIKE ? OR institution LIKE ? OR subject LIKE ? OR country LIKE ?)")
        params += [f"%{q}%"] * 4
    if opp_type:
        where.append("type = ?"); params.append(opp_type)
    if degree:
        where.append("(degree_level = ? OR degree_level = 'Any')"); params.append(degree)
    if country:
        where.append("country = ?"); params.append(country)
    if subject:
        where.append("subject = ?"); params.append(subject)
    if funding:
        where.append("funding_type = ?"); params.append(funding)
    if open_only:
        where.append("(deadline IS NULL OR deadline >= ?)"); params.append(date.today().isoformat())
    where_sql = " WHERE " + " AND ".join(where) if where else ""

    order_options = {"deadline": "deadline IS NULL, deadline ASC",
                     "title": "title ASC", "newest": "id DESC"}
    order_sql = order_options.get(sort, order_options["deadline"])

    conn = get_db()
    total = conn.execute("SELECT COUNT(*) FROM opportunities" + where_sql, params).fetchone()[0]
    results = conn.execute(
        "SELECT * FROM opportunities" + where_sql + f" ORDER BY {order_sql} LIMIT ? OFFSET ?",
        params + [PER_PAGE, (page - 1) * PER_PAGE]).fetchall()
    conn.close()

    total_pages = max(1, -(-total // PER_PAGE))
    args = request.args.to_dict()
    args.pop("page", None)
    tab_args = {k: v for k, v in args.items() if k != "type"}

    return render_template(
        "results.html", results=results, total=total, page=page, total_pages=total_pages,
        args=args, tab_args=tab_args, type_counts=dict(counted("type")),
        countries=counted("country"), subjects=counted("subject"),
        fundings=dict(counted("funding_type")))


@app.route("/map")
def study_map():
    return render_template("map.html", counts=country_counts(), home_country="", target="")


@app.route("/opportunity/<int:opp_id>")
def detail(opp_id):
    conn = get_db()
    opp = conn.execute("SELECT * FROM opportunities WHERE id = ?", (opp_id,)).fetchone()
    conn.close()
    if opp is None:
        abort(404)
    return render_template("detail.html", opp=opp)



if __name__ == "__main__":
    app.run(debug=True)
