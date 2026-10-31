"""Build world map paths (equirectangular) + country alias map for the Nobel site."""
import json

GEO = "world110.geojson"
DATA = "nobel_data.json"
OUT = "world_paths.json"

ALIAS = {
    "Algeria": "Algeria", "Argentina": "Argentina", "Australia": "Australia", "Austria": "Austria",
    "Azerbaijan": "Azerbaijan", "Bangladesh": "Bangladesh", "Belarus": "Belarus", "Belgium": "Belgium",
    "Bosnia and Herzegovina": "Bosnia and Herz.", "Brazil": "Brazil", "Bulgaria": "Bulgaria",
    "Canada": "Canada", "Chile": "Chile", "China": "China", "Colombia": "Colombia",
    "Costa Rica": "Costa Rica", "Croatia": "Croatia", "Cyprus": "Cyprus",
    "Czech Republic": "Czechia", "Democratic Republic of the Congo": "Dem. Rep. Congo",
    "Denmark": "Denmark", "East Timor": "Timor-Leste", "Egypt": "Egypt", "Ethiopia": "Ethiopia",
    "Finland": "Finland", "France": "France", "Germany": "Germany", "Ghana": "Ghana",
    "Greece": "Greece", "Guatemala": "Guatemala", "Hungary": "Hungary", "Iceland": "Iceland",
    "India": "India", "Indonesia": "Indonesia", "Iran": "Iran", "Iraq": "Iraq", "Ireland": "Ireland",
    "Israel": "Israel", "Italy": "Italy", "Japan": "Japan", "Kenya": "Kenya", "Latvia": "Latvia",
    "Liberia": "Liberia", "Lithuania": "Lithuania", "Madagascar": "Madagascar", "Mexico": "Mexico",
    "Morocco": "Morocco", "Myanmar": "Myanmar", "New Zealand": "New Zealand", "Nigeria": "Nigeria",
    "North Macedonia": "North Macedonia", "Norway": "Norway", "Pakistan": "Pakistan", "Peru": "Peru",
    "Poland": "Poland", "Portugal": "Portugal", "Romania": "Romania", "Russia": "Russia",
    "Slovakia": "Slovakia", "Slovenia": "Slovenia", "South Africa": "South Africa",
    "South Korea": "South Korea", "Spain": "Spain", "Sweden": "Sweden", "Switzerland": "Switzerland",
    "Taiwan": "Taiwan", "Trinidad and Tobago": "Trinidad and Tobago", "Turkey": "Turkey",
    "USA": "United States of America", "Ukraine": "Ukraine", "United Kingdom": "United Kingdom",
    "Venezuela": "Venezuela", "Vietnam": "Vietnam", "Yemen": "Yemen", "Zimbabwe": "Zimbabwe",
    "the Netherlands": "Netherlands",
    # merged into a larger state on the map
    "Scotland": "United Kingdom", "Northern Ireland": "United Kingdom",
}

# countries too small / not present in the 110m map -> manual centroid [lon, lat]
EXTRA = {
    "Faroe Islands (Denmark)": [-6.9, 62.0],
    "Guadeloupe Island": [-61.55, 16.25],
    "Saint Lucia": [-60.98, 13.9],
    "Luxembourg": [6.13, 49.81],
}

LABELS = {
    "United States of America": "United States",
    "United Kingdom": "United Kingdom",
    "Dem. Rep. Congo": "DR Congo",
    "Bosnia and Herz.": "Bosnia & Herzegovina",
    "Czechia": "Czechia",
    "Timor-Leste": "Timor-Leste",
    "North Macedonia": "North Macedonia",
}

LON0, LON1 = -180.0, 180.0
LAT_TOP, LAT_BOTTOM = 84.0, -58.0
W, H = 1000.0, 394.0


def project(lon, lat):
    x = (lon - LON0) / (LON1 - LON0) * W
    y = (LAT_TOP - lat) / (LAT_TOP - LAT_BOTTOM) * H
    return round(x, 1), round(y, 1)


def ring_path(ring):
    pts = [project(lon, lat) for lon, lat in ring]
    if len(pts) < 3:
        return ""
    d = "M" + "L".join(f"{x},{y}" for x, y in pts) + "Z"
    return d


def geom_path(geom):
    t = geom["type"]
    polys = geom["coordinates"] if t == "MultiPolygon" else [geom["coordinates"]]
    out = []
    for poly in polys:
        for ring in poly:
            lats = [p[1] for p in ring]
            if max(lats) < LAT_BOTTOM:
                continue
            d = ring_path(ring)
            if d:
                out.append(d)
    return "".join(out)


def main():
    geo = json.load(open(GEO, encoding="utf-8"))
    records = json.load(open(DATA, encoding="utf-8"))["records"]

    paths, labels = {}, {}
    for f in geo["features"]:
        name = f["properties"].get("NAME") or f["properties"].get("name")
        if not name:
            continue
        d = geom_path(f["geometry"])
        if not d:
            continue
        paths[name] = d
        labels[name] = LABELS.get(name, name)

    counts = {}
    for r in records:
        c = r.get("bc")
        if c:
            counts[c] = counts.get(c, 0) + 1

    missing = [c for c in counts if c not in ALIAS and c not in EXTRA]
    if missing:
        raise SystemExit("unmapped countries: %s" % missing)

    # click map: NE name -> data country name (the one with most records)
    click = {}
    for c, n in counts.items():
        ne = ALIAS.get(c)
        if not ne:
            continue
        if ne not in click or n > counts.get(click[ne], 0):
            click[ne] = c

    # verify every alias target exists on the map (or is an EXTRA dot)
    bad = [c for c, ne in ALIAS.items() if ne not in paths]
    if bad:
        raise SystemExit("alias targets missing from geojson: %s" % [(c, ALIAS[c]) for c in bad])

    payload = {
        "paths": paths,
        "alias": ALIAS,
        "extra": EXTRA,
        "click": click,
        "label": labels,
    }
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"))
    print("countries on map:", len(paths))
    print("alias entries:", len(ALIAS), "extra dots:", len(EXTRA))
    print("data countries:", len(counts))
    print("size KB:", round(len(json.dumps(payload)) / 1024, 1))
    print("unused aliases:", [c for c in ALIAS if c not in counts])


if __name__ == "__main__":
    main()
