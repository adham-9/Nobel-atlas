"""Prepare a compact JSON dataset for the interactive Nobel website."""
import json
import math
import re

import pandas as pd

SRC = "nobel_prize_winners - nobel_prize_winners.csv"
OUT = "nobel_data.json"

df = pd.read_csv(SRC)

# --- cleaning (mirrors the notebook) ----------------------------------------
df = df.drop(columns=["categoryTopMotivation", "penName"], errors="ignore")

org_mask = df["gender"].isna()
for col in ["knownName", "givenName", "familyName", "fullName"]:
    if col in df.columns:
        df.loc[org_mask, col] = df.loc[org_mask, col].fillna(df.loc[org_mask, "name"])
df.loc[org_mask, "gender"] = "organization"

df["gender"] = df["gender"].astype(str).str.strip().str.lower()
gmap = {"male": "Male", "female": "Female", "organization": "Organization"}
df["winner_type"] = df["gender"].map(gmap).fillna("Unknown")

# names
df["display_name"] = (
    df["knownName"].fillna(df["orgName"]).fillna(df["name"]).astype(str).str.strip()
)

# birth year / age
def year_of(v):
    if not isinstance(v, str):
        return None
    m = re.match(r"^(\d{4})", v)
    if not m:
        return None
    y = int(m.group(1))
    return y if 1000 < y < 2030 else None

df["birth_year"] = df["birth_date"].map(year_of)
df["age"] = df["awardYear"] - df["birth_year"]
df.loc[(df["age"] < 15) | (df["age"] > 105), "age"] = None

df["decade"] = (df["awardYear"] // 10) * 10

# countries
def norm_country(v):
    if not isinstance(v, str):
        return None
    v = v.strip()
    if not v or v.upper() in {"N/A", "NA", "NONE"}:
        return None
    return v

df["birth_country"] = df["birth_countryNow"].map(norm_country).fillna(
    df["birth_country"].map(norm_country)
)
df["birth_continent"] = df["birth_continent"].map(norm_country)

# affiliation parsing: "University, City, Country"
def split_aff(v):
    if not isinstance(v, str) or not v.strip() or v.strip().upper() in {"N/A", "NA"}:
        return (None, None)
    parts = [p.strip() for p in v.split(",") if p.strip()]
    if len(parts) < 2:
        return (parts[0] if parts else None, None)
    return (parts[0], parts[-1])

aff = df["affiliation_1"].map(split_aff)
df["institution"] = [a[0] for a in aff]
df["aff_country"] = [a[1] for a in aff]

# winners per prize
df["n_winners"] = df.groupby(["awardYear", "category"])["id"].transform("count")

# migrant = birth country differs from affiliation country
def same(a, b):
    if not isinstance(a, str) or not isinstance(b, str):
        return None
    a, b = a.strip(), b.strip()
    if not a or not b:
        return None
    return a.lower() == b.lower()

df["migrant"] = [
    None if same(a, b) is None else (not same(a, b))
    for a, b in zip(df["birth_country"], df["aff_country"])
]

# --- compact records --------------------------------------------------------
def clean_num(x):
    if x is None:
        return None
    try:
        f = float(x)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(f) or math.isinf(f) else f

def txt(x, limit=None):
    if not isinstance(x, str):
        return None
    x = " ".join(x.split())
    if not x or x.upper() in {"N/A", "NA"}:
        return None
    if limit and len(x) > limit:
        x = x[: limit - 1].rstrip() + "…"
    return x

records = []
for _, r in df.iterrows():
    records.append(
        {
            "n": txt(r["display_name"]),
            "y": int(r["awardYear"]),
            "c": r["category"],
            "t": r["winner_type"],
            "age": clean_num(r["age"]),
            "bc": txt(r["birth_country"]),
            "bct": txt(r["birth_continent"]),
            "city": txt(r["birth_city"]),
            "ac": txt(r["aff_country"]),
            "inst": txt(r["institution"]),
            "p": txt(r["portion"]),
            "nw": int(r["n_winners"]),
            "pa": clean_num(r["prizeAmount"]),
            "padj": clean_num(r["prizeAmountAdjusted"]),
            "mig": r["migrant"],
            "mot": txt(r["motivation"], 420),
            "link": txt(r["award_link"]),
            "llink": txt(r["laureate_link"]),
            "full": txt(r["fullName"]),
            "born": txt(r["birth_date"]),
            "died": txt(r["death_date"]),
            "place": txt(r["birth_locationString"]),
            "aff": txt(r["affiliation_1"]),
            "org": txt(r["orgName"]),
            "status": txt(r["prizeStatus"]),
        }
    )

payload = {
    "meta": {
        "source": "Nobel Prize API (1901–2019)",
        "rows": len(records),
        "years": [int(df["awardYear"].min()), int(df["awardYear"].max())],
        "categories": [
            "Physics",
            "Chemistry",
            "Physiology or Medicine",
            "Literature",
            "Peace",
            "Economic Sciences",
        ],
    },
    "records": records,
}

with open(OUT, "w", encoding="utf-8") as fh:
    json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"))

print("wrote", OUT, "records:", len(records))

# --- stats for narrative ----------------------------------------------------
print("\nrows", len(df), "awards", df.groupby(["awardYear", "category"]).ngroups)
print("missing per key col:")
for c in ["age", "birth_country", "aff_country", "institution", "motivation", "portion"]:
    print(f"  {c}: {df[c].isna().sum()}")
print("\nmean age", round(df["age"].mean(), 1), "median", df["age"].median())
print("\nage by category:")
print(df.groupby("category")["age"].agg(["count", "mean", "median", "min", "max"]).round(1))
print("\nfemale by category:")
print(df[df.winner_type == "Female"].groupby("category").size())
print("\ntop birth countries:")
print(df["birth_country"].value_counts().head(12))
print("\ntop institutions:")
print(df["institution"].value_counts().head(12))
print("\ntop aff countries:")
print(df["aff_country"].value_counts().head(12))
print("\nby decade gender:")
print(pd.crosstab(df["decade"], df["winner_type"]))
print("\ncollab by decade (%):")
print((pd.crosstab(df["decade"], df["n_winners"] > 1, normalize="index") * 100).round(1))
print("\nmigration rate by decade:")
print((df.groupby("decade")["migrant"].mean() * 100).round(1))
print("\nmigrant total:", df["migrant"].sum(), "of", df["migrant"].notna().sum())
print("\nprize amounts:")
print(df.groupby("decade")["prizeAmountAdjusted"].mean().round(0))
print("\nrepeat winners:")
print(df["n"].value_counts()[lambda s: s > 1].head(10))
print("\nportion counts:", df["portion"].value_counts().to_dict())
print("\npeace orgs:", len(df[(df.winner_type == "Organization") & (df.category == "Peace")]))
print("first female year:", df[df.winner_type == "Female"]["awardYear"].min())
print("age extremes:", df["age"].min(), df["age"].max())
