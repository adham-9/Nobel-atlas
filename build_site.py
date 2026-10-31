"""Bundle the Nobel Atlas into a single self-contained HTML file."""
import json
import os

SRC = "site_src"
OUT_DIR = "site"
OUT = os.path.join(OUT_DIR, "index.html")


def read(name):
    with open(os.path.join(SRC, name), encoding="utf-8") as fh:
        return fh.read()


def main():
    template = read("index.template.html")
    css = read("styles.css")
    app = read("core.js") + "\n" + read("views.js") + "\n" + read("chat.js")

    with open("nobel_data.json", encoding="utf-8") as fh:
        data = json.load(fh)
    with open("world_paths.json", encoding="utf-8") as fh:
        data["world"] = json.load(fh)

    data_js = "window.__NOBEL__ = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";"

    html = template.replace("/*__CSS__*/", css)
    html = html.replace("/*__DATA__*/", data_js)
    html = html.replace("/*__APP__*/", app)

    os.makedirs(OUT_DIR, exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write(html)

    print("wrote", OUT, round(os.path.getsize(OUT) / 1024, 1), "KB")


if __name__ == "__main__":
    main()
