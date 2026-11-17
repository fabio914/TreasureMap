"""Embed data/maps.json into src/template.html and write index.html."""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

template = open(os.path.join(ROOT, "src", "template.html"), encoding="utf-8").read()
maps = open(os.path.join(ROOT, "data", "maps.json"), encoding="utf-8").read()
assert "</script" not in maps, "map data must not contain a closing script tag"
out = os.path.join(ROOT, "index.html")
open(out, "w", encoding="utf-8").write(template.replace("/*MAPS*/", maps))
print("wrote", out, os.path.getsize(out), "bytes")
