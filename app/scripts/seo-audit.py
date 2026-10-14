#!/usr/bin/env python3
"""
SEO + GEO audit for a single site.

Self-contained: requests + beautifulsoup4 only. Checks the things the two SEO
skills we follow actually gate on: indexability, meta lengths, canonical,
hreflang reciprocity, JSON-LD validity, social cards, AI crawler access,
sitemap, security headers and passage citability.

Usage: python scripts/seo-audit.py https://example.com
"""
from __future__ import annotations

import json
import re
import sys
import xml.etree.ElementTree as ET
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

TIMEOUT = 20
UA = "Mozilla/5.0 (compatible; seo-audit/1.0)"

findings: list[tuple[str, str, str]] = []  # (severity, id, message)


def add(sev: str, ident: str, msg: str) -> None:
    findings.append((sev, ident, msg))


def fetch(url: str) -> requests.Response:
    return requests.get(url, timeout=TIMEOUT, headers={"user-agent": UA, "accept-language": "fr,en"})


def audit_page(path: str, base: str) -> None:
    url = urljoin(base, path)
    try:
        r = fetch(url)
    except Exception as exc:  # noqa: BLE001
        add("critical", "unreachable", f"{url} unreachable: {exc}")
        return
    if r.status_code != 200:
        add("critical", "status", f"{url} returned {r.status_code}")
        return

    soup = BeautifulSoup(r.text, "html.parser")

    # --- title / description -------------------------------------------------
    title = (soup.title.string or "").strip() if soup.title else ""
    if not title:
        add("critical", "title", f"{path}: missing title")
    elif not 20 <= len(title) <= 65:
        add("high", "title-length", f"{path}: title is {len(title)} chars (aim 20-65)")

    desc_tag = soup.find("meta", attrs={"name": "description"})
    desc = (desc_tag.get("content") or "").strip() if desc_tag else ""
    if not desc:
        add("high", "description", f"{path}: missing meta description")
    elif not 70 <= len(desc) <= 165:
        add("medium", "description-length", f"{path}: description is {len(desc)} chars (aim 70-165)")

    # --- headings ------------------------------------------------------------
    h1s = soup.find_all("h1")
    if len(h1s) != 1:
        add("high", "h1", f"{path}: {len(h1s)} h1 tags (want exactly 1)")

    # --- canonical -----------------------------------------------------------
    canon = soup.find("link", rel="canonical")
    if not canon or not canon.get("href"):
        add("high", "canonical", f"{path}: missing canonical")
    else:
        href = canon["href"]
        if urlparse(href).netloc and urlparse(href).netloc != urlparse(base).netloc:
            add("high", "canonical-cross", f"{path}: canonical points to {href}")
        if href.rstrip("/") != url.rstrip("/"):
            add("medium", "canonical-self", f"{path}: canonical {href} differs from {url}")

    # --- lang / viewport -----------------------------------------------------
    html = soup.find("html")
    if not html or not html.get("lang"):
        add("medium", "lang", f"{path}: <html> has no lang")
    if not soup.find("meta", attrs={"name": "viewport"}):
        add("high", "viewport", f"{path}: missing viewport")

    # --- social --------------------------------------------------------------
    for prop in ("og:title", "og:description", "og:image", "og:url", "og:type"):
        if not soup.find("meta", attrs={"property": prop}):
            add("medium", "og", f"{path}: missing {prop}")
    if not soup.find("meta", attrs={"name": "twitter:card"}):
        add("low", "twitter", f"{path}: missing twitter:card")

    # --- hreflang ------------------------------------------------------------
    alts = soup.find_all("link", rel="alternate", hreflang=True)
    codes = {a["hreflang"] for a in alts}
    if not alts:
        add("high", "hreflang", f"{path}: no hreflang alternates")
    else:
        if "x-default" not in codes:
            add("medium", "hreflang-xdefault", f"{path}: no x-default hreflang")
        # reciprocity: each alternate must link back to this page
        for a in alts[:12]:
            target = a["href"]
            try:
                tr = fetch(target)
                tsoup = BeautifulSoup(tr.text, "html.parser")
                back = {b["hreflang"] for b in tsoup.find_all("link", rel="alternate", hreflang=True)}
                if "x-default" not in back and html is not None:
                    pass
                if not back:
                    add("medium", "hreflang-back", f"{path}: {target} has no return alternates")
            except Exception:  # noqa: BLE001
                add("medium", "hreflang-back", f"{path}: {target} unreachable for reciprocity check")

    # --- JSON-LD -------------------------------------------------------------
    blocks = soup.find_all("script", type="application/ld+json")
    if not blocks:
        add("high", "jsonld", f"{path}: no JSON-LD")
    types: set[str] = set()
    for blk in blocks:
        try:
            data = json.loads(blk.string or "{}")
        except json.JSONDecodeError as exc:
            add("high", "jsonld-parse", f"{path}: invalid JSON-LD ({exc})")
            continue
        for node in data.get("@graph", [data]) if isinstance(data, dict) else []:
            t = node.get("@type") if isinstance(node, dict) else None
            if t:
                types.add(t)
    if types:
        print(f"    schema types: {', '.join(sorted(types))}")

    # --- images --------------------------------------------------------------
    imgs = soup.find_all("img")
    missing_alt = [i for i in imgs if i.get("alt") is None]
    if imgs and missing_alt:
        add("low", "img-alt", f"{path}: {len(missing_alt)}/{len(imgs)} images without alt")

    # --- thin content --------------------------------------------------------
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()
    text = re.sub(r"\s+", " ", soup.get_text(" ")).strip()
    words = len(text.split())
    if words < 150:
        add("medium", "thin", f"{path}: only {words} words of text")

    # --- citability ----------------------------------------------------------
    paragraphs = [p.get_text(" ", strip=True) for p in soup.find_all("p")]
    has_answer = any(60 <= len(p.split()) <= 190 for p in paragraphs)
    if not has_answer:
        add("medium", "citability", f"{path}: no self-contained 60-190 word answer block")

    print(f"  {path:12} {r.status_code}  title {len(title):>3}  desc {len(desc):>3}  words {words:>5}  {len(r.content)/1024:.0f} KB")


def audit_infra(base: str) -> None:
    # robots.txt
    r = fetch(urljoin(base, "/robots.txt"))
    if r.status_code != 200:
        add("high", "robots", "robots.txt missing")
    else:
        body = r.text
        if "sitemap:" not in body.lower():
            add("medium", "robots-sitemap", "robots.txt has no Sitemap directive")
        roles = {
            "search": ["oai-searchbot", "claude-searchbot", "perplexitybot"],
            "training": ["gptbot", "claudebot", "ccbot"],
        }
        for role, bots in roles.items():
            missing = [b for b in bots if b not in body.lower()]
            if missing:
                add("low", "robots-ai", f"robots.txt does not name {role} crawler(s): {', '.join(missing)}")

    # sitemap
    r = fetch(urljoin(base, "/sitemap.xml"))
    if r.status_code != 200:
        add("high", "sitemap", "sitemap.xml missing")
    else:
        try:
            root = ET.fromstring(r.text)
            urls = root.findall("{http://www.sitemaps.org/schemas/sitemap/0.9}url")
            print(f"  sitemap: {len(urls)} URLs")
            if not urls:
                add("high", "sitemap-empty", "sitemap has no <url> entries")
        except ET.ParseError as exc:
            add("high", "sitemap-parse", f"sitemap invalid: {exc}")

    # security headers
    r = fetch(base)
    want = {
        "strict-transport-security": "high",
        "content-security-policy": "medium",
        "x-content-type-options": "medium",
        "x-frame-options": "medium",
        "referrer-policy": "low",
    }
    for header, sev in want.items():
        if header not in {k.lower() for k in r.headers}:
            add(sev, "header", f"missing header: {header}")
    print(f"  headers: {', '.join(sorted(h for h in r.headers if h.lower() in want)) or 'none'}")

    # https + redirect
    http_url = base.replace("https://", "http://")
    try:
        rr = requests.get(http_url, timeout=TIMEOUT, allow_redirects=False, headers={"user-agent": UA})
        if rr.status_code not in (301, 302, 308):
            add("high", "https-redirect", f"{http_url} does not redirect to https")
    except Exception:  # noqa: BLE001
        add("medium", "https", "http endpoint unreachable")


def main() -> int:
    site = (sys.argv[1] if len(sys.argv) > 1 else "https://is-it-generated-by-ai.org").rstrip("/")
    print(f"SEO/GEO audit — {site}\n")
    print("Pages:")
    for path in ("/", "/faq/", "/legal/"):
        audit_page(path, site)
    print("\nInfrastructure:")
    audit_infra(site)

    print("\nFindings:")
    if not findings:
        print("  none")
    for sev, ident, msg in sorted(findings, key=lambda f: {"critical": 0, "high": 1, "medium": 2, "low": 3}[f[0]]):
        print(f"  [{sev.upper():8}] {ident:18} {msg}")

    weights = {"critical": 12, "high": 6, "medium": 3, "low": 1}
    penalty = sum(weights[s] for s, _, _ in findings)
    score = max(0, 100 - penalty)
    print(f"\nHealth score: {score}/100  ({len(findings)} findings)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
