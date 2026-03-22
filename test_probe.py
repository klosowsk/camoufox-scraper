#!/usr/bin/env python3
"""
Camoufox Stealth Probe

Tests the camoufox-scraper service against public fingerprint/bot-detection
probe sites and prints a structured stealth report.

Usage:
    # Start the service first:
    docker compose up -d --build

    # Run probes:
    pip install requests lxml
    python test_probe.py

    # Test fingerprint persistence across restarts:
    python test_probe.py --check-persistence

    # Custom service URL:
    python test_probe.py --url http://localhost:8080

    # Skip slow probes:
    python test_probe.py --quick

    # Save full report (JSON + raw HTML) for AI analysis:
    python test_probe.py -o ./probe-reports
    # Creates: probe-reports/probe_2026-03-22_143052.json
    #          probe-reports/raw/sannysoft_2026-03-22_143052.html
    #          probe-reports/raw/webrtc_2026-03-22_143052.html
    #          probe-reports/raw/tls_2026-03-22_143052.html
"""

import argparse
import hashlib
import json
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

try:
    import requests
    from lxml import html as lxml_html
except ImportError:
    print("Missing dependencies. Install with:")
    print("  pip install requests lxml")
    sys.exit(1)


# ---------------------------------------------------------------------------
# Terminal colors (no external dependency)
# ---------------------------------------------------------------------------

class C:
    GREEN = "\033[92m"
    RED = "\033[91m"
    YELLOW = "\033[93m"
    CYAN = "\033[96m"
    DIM = "\033[2m"
    BOLD = "\033[1m"
    RESET = "\033[0m"


def passed(text="PASS"):
    return f"{C.GREEN}{text}{C.RESET}"


def failed(text="FAIL"):
    return f"{C.RED}{text}{C.RESET}"


def warned(text="WARN"):
    return f"{C.YELLOW}{text}{C.RESET}"


def header(text):
    return f"\n{C.BOLD}{C.CYAN}--- {text} ---{C.RESET}"


def dim(text):
    return f"{C.DIM}{text}{C.RESET}"


# ---------------------------------------------------------------------------
# Service helpers
# ---------------------------------------------------------------------------

def wait_for_healthy(base_url, timeout=120):
    """Wait for the service to be healthy."""
    print(f"Waiting for service at {base_url} ...", end="", flush=True)
    start = time.time()
    while time.time() - start < timeout:
        try:
            r = requests.get(f"{base_url}/health", timeout=5)
            if r.status_code == 200:
                print(f" {passed('ready')} ({int(time.time() - start)}s)")
                return True
        except requests.ConnectionError:
            pass
        print(".", end="", flush=True)
        time.sleep(3)
    print(f" {failed('timeout')}")
    return False


def get_config(base_url):
    """Fetch and display the service configuration."""
    try:
        r = requests.get(f"{base_url}/config", timeout=10)
        return r.json()
    except Exception as e:
        print(f"  {failed('ERROR')} fetching config: {e}")
        return {}


def scrape(base_url, url, wait_after_load=3, timeout=30000):
    """Scrape a URL via the camoufox service."""
    try:
        r = requests.post(
            f"{base_url}/scrape",
            json={
                "url": url,
                "wait_after_load": wait_after_load,
                "timeout": timeout,
            },
            timeout=60,
        )
        return r.json()
    except Exception as e:
        print(f"  {failed('ERROR')} scraping {url}: {e}")
        return {}


# ---------------------------------------------------------------------------
# Probe: bot.sannysoft.com
# ---------------------------------------------------------------------------

def probe_sannysoft(base_url):
    """Probe bot.sannysoft.com and parse the bot detection results."""
    print(header("bot.sannysoft.com"))
    print(dim("  Bot detection: webdriver, chrome object, plugins, canvas, WebGL..."))
    print()

    result = scrape(base_url, "https://bot.sannysoft.com", wait_after_load=5)
    page_html = result.get("html", "")

    if not page_html:
        print(f"  {failed('ERROR')} No HTML returned")
        return {"score": 0, "total": 0, "tests": [], "_raw_html": ""}

    tree = lxml_html.fromstring(page_html)
    tests = []
    counts = {"passed": 0, "failed": 0, "warn": 0}

    # --- Table 1: Intoli tests (first table with th "Test Name") ---
    tables = tree.xpath("//table")
    for table in tables:
        rows = table.xpath(".//tr")
        for row in rows:
            cells = row.xpath("td")
            if len(cells) < 2:
                continue

            # Test name: first cell text (strip age spans)
            name_cell = cells[0]
            # Remove <span> children to get clean name
            name = name_cell.text_content().strip()
            # Clean up "(Old)" / "(New)" annotations
            for suffix in ["(Old)", "(New)"]:
                name = name.replace(suffix, "").strip()

            # Result: second cell class + text
            result_cell = cells[1]
            classes = result_cell.get("class", "")
            value = result_cell.text_content().strip()[:80]

            if "passed" in classes:
                status = "passed"
                counts["passed"] += 1
            elif "warn" in classes:
                status = "warn"
                counts["warn"] += 1
            elif "failed" in classes:
                status = "failed"
                counts["failed"] += 1
            else:
                # Info-only rows (no pass/fail class), like "Some details" table
                continue

            tests.append({"name": name, "status": status, "value": value})

    # Print results
    for t in tests:
        if t["status"] == "passed":
            tag = passed()
        elif t["status"] == "warn":
            tag = warned()
        else:
            tag = failed()

        # Truncate value for display
        val = t["value"][:60] if t["value"] else ""
        print(f"  {t['name']:<40s} {tag}  {dim(val)}")

    total = counts["passed"] + counts["failed"] + counts["warn"]
    score_str = f"{counts['passed']}/{total} passed"
    if counts["warn"]:
        score_str += f", {counts['warn']} warnings"
    if counts["failed"]:
        score_str += f", {counts['failed']} failed"

    color = C.GREEN if counts["failed"] == 0 else C.RED if counts["failed"] > 3 else C.YELLOW
    print(f"\n  {C.BOLD}Score: {color}{score_str}{C.RESET}")

    return {"score": counts["passed"], "total": total, "tests": tests, "_raw_html": page_html}


# ---------------------------------------------------------------------------
# Probe: browserleaks.com/webrtc
# ---------------------------------------------------------------------------

def probe_webrtc(base_url):
    """Probe browserleaks.com/webrtc to check for WebRTC IP leaks."""
    print(header("browserleaks.com/webrtc"))
    print(dim("  WebRTC leak detection: local IPs, public IP exposure..."))
    print()

    result = scrape(base_url, "https://browserleaks.com/webrtc", wait_after_load=5)
    page_html = result.get("html", "")

    if not page_html:
        print(f"  {failed('ERROR')} No HTML returned")
        return {"_raw_html": ""}

    tree = lxml_html.fromstring(page_html)

    # browserleaks uses various containers for results
    # Key things to look for: "WebRTC Support", "ICE Candidate", IP addresses
    report = {}

    # Try to find the WebRTC support status
    # The page typically shows "WebRTC Support: true/false" and lists ICE candidates
    body_text = tree.text_content()

    # Check if WebRTC is detected as supported
    if "WebRTC Support" in body_text:
        # Look for the WebRTC support indicator
        support_els = tree.xpath("//*[contains(text(), 'WebRTC Support')]")
        if support_els:
            # Find the value in the next sibling or parent row
            parent = support_els[0].getparent()
            if parent is not None:
                value = parent.text_content().replace("WebRTC Support", "").strip()
                report["webrtc_support"] = value
                status = warned("SPOOFED") if "true" in value.lower() else passed("BLOCKED")
                print(f"  {'WebRTC Support':<40s} {status}  {dim(value[:60])}")

    # Look for IP address patterns in ICE candidates
    import re
    ip_pattern = re.compile(r"\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b")

    # Find elements that contain ICE candidate info
    ice_elements = tree.xpath("//*[contains(@class, 'ice') or contains(@id, 'ice')]")
    found_ips = set()
    for el in ice_elements:
        text = el.text_content()
        ips = ip_pattern.findall(text)
        found_ips.update(ips)

    # Also search the full page for any candidate-related text
    candidate_sections = tree.xpath("//*[contains(text(), 'candidate')]")
    for el in candidate_sections:
        text = el.text_content()
        ips = ip_pattern.findall(text)
        found_ips.update(ips)

    # Filter out common non-leak IPs
    leak_ips = {ip for ip in found_ips if not ip.startswith("0.") and ip != "0.0.0.0"}

    if leak_ips:
        # Check if these are local/private IPs
        private_ips = {ip for ip in leak_ips
                       if ip.startswith("10.") or ip.startswith("192.168.")
                       or ip.startswith("172.16.") or ip.startswith("172.17.")
                       or ip.startswith("172.18.") or ip.startswith("172.19.")
                       or ip.startswith("172.2") or ip.startswith("172.3")}
        public_ips = leak_ips - private_ips

        if public_ips:
            print(f"  {'Public IPs Exposed':<40s} {warned('LEAK')}  {dim(', '.join(public_ips))}")
        else:
            print(f"  {'Public IPs Exposed':<40s} {passed('NONE')}")

        if private_ips:
            print(f"  {'Private IPs Exposed':<40s} {warned('VISIBLE')}  {dim(', '.join(private_ips))}")
        else:
            print(f"  {'Private IPs Exposed':<40s} {passed('NONE')}")
    else:
        print(f"  {'IP Leak via WebRTC':<40s} {passed('NO LEAK')}")

    report["leaked_ips"] = list(leak_ips)

    # Try to get the page's detected public IP (usually shown at top)
    ip_display = tree.xpath("//*[contains(@class, 'ip')]")
    for el in ip_display:
        text = el.text_content().strip()
        ips = ip_pattern.findall(text)
        if ips:
            report["detected_public_ip"] = ips[0]
            print(f"  {'Detected Public IP':<40s} {dim(ips[0])}")
            break

    report["_raw_html"] = page_html
    return report


# ---------------------------------------------------------------------------
# Probe: tls.peet.ws
# ---------------------------------------------------------------------------

def probe_tls(base_url):
    """Probe tls.peet.ws to check TLS/JA3/HTTP2 fingerprint."""
    print(header("tls.peet.ws"))
    print(dim("  TLS fingerprint: JA3/JA4 hash, HTTP/2 settings, user agent..."))
    print()

    # tls.peet.ws/api/all returns JSON — but we need the browser to fetch it
    # so the TLS handshake comes from Camoufox, not from requests/curl
    result = scrape(base_url, "https://tls.peet.ws/api/all", wait_after_load=2)
    page_html = result.get("html", "")

    if not page_html:
        print(f"  {failed('ERROR')} No HTML returned")
        return {"_raw_html": ""}

    # The page content should be raw JSON rendered in a <pre> or <body>
    tree = lxml_html.fromstring(page_html)
    body_text = tree.text_content().strip()

    try:
        tls_data = json.loads(body_text)
    except json.JSONDecodeError:
        # Sometimes the JSON is inside a <pre> tag
        pre = tree.xpath("//pre")
        if pre:
            try:
                tls_data = json.loads(pre[0].text_content().strip())
            except json.JSONDecodeError:
                print(f"  {failed('ERROR')} Could not parse TLS data as JSON")
                print(f"  {dim('First 200 chars: ' + body_text[:200])}")
                return {}
        else:
            print(f"  {failed('ERROR')} Could not parse TLS data as JSON")
            return {}

    report = {}

    # Extract key fields
    # JA3 hash
    ja3_hash = tls_data.get("tls", {}).get("ja3_hash", "")
    ja3 = tls_data.get("tls", {}).get("ja3", "")
    if ja3_hash:
        report["ja3_hash"] = ja3_hash
        print(f"  {'JA3 Hash':<40s} {dim(ja3_hash)}")

    # JA4
    ja4 = tls_data.get("tls", {}).get("ja4", "")
    if ja4:
        report["ja4"] = ja4
        print(f"  {'JA4':<40s} {dim(ja4)}")

    # Peetprint (their custom fingerprint)
    peetprint_hash = tls_data.get("tls", {}).get("peetprint_hash", "")
    if peetprint_hash:
        report["peetprint_hash"] = peetprint_hash
        print(f"  {'Peetprint Hash':<40s} {dim(peetprint_hash)}")

    # User-Agent from HTTP headers
    user_agent = ""
    http_headers = tls_data.get("http_1", {}).get("headers", [])
    if not http_headers:
        http_headers = tls_data.get("http_2", {}).get("sent_headers", [])
    for h in http_headers:
        key = h.get("key", h.get("name", ""))
        if key.lower() == "user-agent":
            user_agent = h.get("value", "")
            break
    if user_agent:
        report["user_agent"] = user_agent
        # Check if it looks like Firefox
        is_firefox = "Firefox" in user_agent or "Gecko" in user_agent
        tag = passed("Firefox") if is_firefox else warned("NOT Firefox")
        print(f"  {'User-Agent':<40s} {tag}  {dim(user_agent[:50])}")

    # HTTP/2 fingerprint
    h2_fp = tls_data.get("http_2", {}).get("akamai_fingerprint_hash", "")
    h2_fp_full = tls_data.get("http_2", {}).get("akamai_fingerprint", "")
    if h2_fp:
        report["h2_fingerprint_hash"] = h2_fp
        print(f"  {'HTTP/2 Fingerprint Hash':<40s} {dim(h2_fp)}")

    # TLS version
    tls_version = tls_data.get("tls", {}).get("tls_version_record", "")
    if tls_version:
        report["tls_version"] = tls_version
        print(f"  {'TLS Version':<40s} {dim(tls_version)}")

    # IP
    ip = tls_data.get("ip", "")
    if ip:
        report["ip"] = ip
        print(f"  {'IP Address':<40s} {dim(ip)}")

    # Store full TLS data for AI analysis
    report["_full_tls_data"] = tls_data
    report["_raw_html"] = page_html
    return report


# ---------------------------------------------------------------------------
# Fingerprint persistence check
# ---------------------------------------------------------------------------

def check_persistence(base_url, userdata_dir="./userdata"):
    """Check that the fingerprint survives a container restart."""
    print(header("Fingerprint Persistence Check"))

    fp_path = Path(userdata_dir) / "fingerprint.json"

    if not fp_path.exists():
        print(f"  {failed('ERROR')} Fingerprint file not found at {fp_path}")
        print(f"  Make sure the service has started at least once with CAMOUFOX_PERSISTENT=true")
        return False

    # Read fingerprint hash before restart
    fp_before = hashlib.sha256(fp_path.read_bytes()).hexdigest()[:16]
    print(f"  Fingerprint hash before restart: {dim(fp_before)}")

    # Restart the container
    print(f"  Restarting container...", end="", flush=True)
    try:
        subprocess.run(
            ["docker", "compose", "restart", "camoufox"],
            capture_output=True, text=True, check=True,
            cwd=Path(__file__).parent,
        )
        print(f" {passed('done')}")
    except subprocess.CalledProcessError as e:
        print(f" {failed('ERROR')}: {e.stderr}")
        return False

    # Wait for service to be healthy again
    if not wait_for_healthy(base_url, timeout=120):
        return False

    # Read fingerprint hash after restart
    fp_after = hashlib.sha256(fp_path.read_bytes()).hexdigest()[:16]
    print(f"  Fingerprint hash after restart:  {dim(fp_after)}")

    if fp_before == fp_after:
        print(f"\n  {passed('PASS')} Fingerprint persisted across restart")
        return True
    else:
        print(f"\n  {failed('FAIL')} Fingerprint changed after restart!")
        return False


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def save_report(results, config, output_dir, timestamp):
    """Save the full probe report as JSON + raw HTML files for AI analysis."""
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)
    raw_dir = out / "raw"
    raw_dir.mkdir(exist_ok=True)

    ts = timestamp.strftime("%Y-%m-%d_%H%M%S")

    # Build JSON report (without raw HTML — that goes to separate files)
    report = {
        "timestamp": timestamp.isoformat(),
        "config": config,
        "probes": {},
    }

    for probe_name, probe_data in results.items():
        # Separate raw HTML and full data from the summary
        clean = {k: v for k, v in probe_data.items() if not k.startswith("_")}
        report["probes"][probe_name] = clean

        # Save raw HTML
        raw_html = probe_data.get("_raw_html", "")
        if raw_html:
            html_path = raw_dir / f"{probe_name}_{ts}.html"
            html_path.write_text(raw_html, encoding="utf-8")

        # Save full TLS data if present
        full_tls = probe_data.get("_full_tls_data")
        if full_tls:
            tls_path = raw_dir / f"{probe_name}_full_{ts}.json"
            tls_path.write_text(json.dumps(full_tls, indent=2), encoding="utf-8")

    # Save the summary report
    report_path = out / f"probe_{ts}.json"
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")

    return report_path


def main():
    parser = argparse.ArgumentParser(description="Camoufox Stealth Probe")
    parser.add_argument("--url", default="http://localhost:8080",
                        help="Camoufox scraper service URL (default: http://localhost:8080)")
    parser.add_argument("--check-persistence", action="store_true",
                        help="Restart container and verify fingerprint persists")
    parser.add_argument("--userdata-dir", default="./userdata",
                        help="Path to userdata directory (default: ./userdata)")
    parser.add_argument("--quick", action="store_true",
                        help="Skip slower probes (browserleaks, tls)")
    parser.add_argument("-o", "--output", default="./probe-reports",
                        help="Output directory for JSON reports + raw HTML (default: ./probe-reports)")
    parser.add_argument("--no-save", action="store_true",
                        help="Don't save report files (terminal output only)")
    args = parser.parse_args()

    print(f"\n{C.BOLD}{'=' * 50}")
    print(f"  Camoufox Stealth Probe")
    print(f"{'=' * 50}{C.RESET}\n")

    # Wait for service
    if not wait_for_healthy(args.url):
        print(f"\n{failed('Service not available. Is docker compose up?')}")
        sys.exit(1)

    # Show config
    print(header("Service Configuration"))
    config = get_config(args.url)
    if config:
        for key, val in config.items():
            print(f"  {key:<30s} {dim(str(val))}")

    # Check if fingerprint file exists
    fp_path = Path(args.userdata_dir) / "fingerprint.json"
    if fp_path.exists():
        fp_hash = hashlib.sha256(fp_path.read_bytes()).hexdigest()[:16]
        print(f"\n  {'fingerprint file':<30s} {passed('exists')}  {dim(fp_hash)}")
    else:
        print(f"\n  {'fingerprint file':<30s} {dim('not yet created (first request will generate it)')}")

    # Profile directory
    profile_dir = Path(args.userdata_dir) / "profile"
    if profile_dir.exists():
        file_count = sum(1 for _ in profile_dir.rglob("*") if _.is_file())
        print(f"  {'profile directory':<30s} {passed('exists')}  {dim(f'{file_count} files')}")
    else:
        print(f"  {'profile directory':<30s} {dim('not yet created')}")

    # Run probes
    results = {}

    # Sannysoft — always run (it's the most important bot detection test)
    results["sannysoft"] = probe_sannysoft(args.url)

    if not args.quick:
        results["webrtc"] = probe_webrtc(args.url)
        results["tls"] = probe_tls(args.url)

    # After probes, check if fingerprint was created
    if not fp_path.exists() and config.get("persistent"):
        print(f"\n  {warned('NOTE')} Fingerprint file still not found — check service logs")
    elif fp_path.exists() and not config.get("persistent"):
        print(f"\n  {dim('Fingerprint file exists but persistent mode is off')}")

    # Persistence check
    if args.check_persistence:
        check_persistence(args.url, args.userdata_dir)

    # Summary
    print(f"\n{C.BOLD}{'=' * 50}")
    print(f"  Summary")
    print(f"{'=' * 50}{C.RESET}")

    if "sannysoft" in results and results["sannysoft"].get("total"):
        s = results["sannysoft"]
        pct = (s["score"] / s["total"] * 100) if s["total"] else 0
        color = C.GREEN if pct >= 90 else C.YELLOW if pct >= 70 else C.RED
        print(f"  Sannysoft:    {color}{s['score']}/{s['total']} ({pct:.0f}%){C.RESET}")

    if "webrtc" in results:
        leaked = results["webrtc"].get("leaked_ips", [])
        if leaked:
            print(f"  WebRTC Leak:  {warned(f'{len(leaked)} IPs exposed')}")
        else:
            print(f"  WebRTC Leak:  {passed('clean')}")

    if "tls" in results and results["tls"].get("user_agent"):
        ua = results["tls"]["user_agent"]
        is_ff = "Firefox" in ua
        print(f"  TLS/UA:       {passed('Firefox') if is_ff else failed('Not Firefox')}")

    # Save report
    if not args.no_save and results:
        ts = datetime.now()
        report_path = save_report(results, config, args.output, ts)
        print(f"\n  Report saved: {dim(str(report_path))}")
        raw_count = sum(1 for _ in (Path(args.output) / "raw").glob("*") if _.is_file())
        print(f"  Raw files:    {dim(f'{raw_count} files in {args.output}/raw/')}")

    print()


if __name__ == "__main__":
    main()
