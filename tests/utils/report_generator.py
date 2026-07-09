import os
from jinja2 import Template

HTML_TEMPLATE = """
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Automation Execution Report</title>
  <style>
    body { font-family: 'Outfit', sans-serif; background-color: #0b0f19; color: #f8fafc; margin: 0; padding: 2rem; }
    h1, h2 { color: #ffffff; }
    .card { background-color: #111827; border: 1px solid #1f2937; border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
    table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
    th, td { padding: 0.75rem 1rem; text-align: left; border-bottom: 1px solid #374151; }
    th { background-color: #1f2937; color: #9ca3af; font-weight: bold; }
    .badge { padding: 0.25rem 0.6rem; border-radius: 9999px; font-size: 0.75rem; font-weight: bold; }
    .badge-pass { background-color: #065f46; color: #34d399; }
    .badge-fail { background-color: #991b1b; color: #f87171; }
    .metric-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; }
    .metric-value { font-size: 2.25rem; font-weight: bold; color: #38bdf8; }
  </style>
</head>
<body>
  <h1>🚑 Road Rescue Automation Test Report</h1>
  <div class="card">
    <h2>Execution Summary</h2>
    <div class="metric-grid">
      <div>
        <div>Total Tests</div>
        <div class="metric-value">{{ total }}</div>
      </div>
      <div>
        <div>Passed</div>
        <div class="metric-value" style="color: #34d399;">{{ passed }}</div>
      </div>
      <div>
        <div>Failed</div>
        <div class="metric-value" style="color: #f87171;">{{ failed }}</div>
      </div>
      <div>
        <div>Pass %</div>
        <div class="metric-value">{{ pass_pct }}%</div>
      </div>
    </div>
  </div>

  <div class="card">
    <h2>Test Case Details</h2>
    <table>
      <thead>
        <tr>
          <th>Test Name</th>
          <th>Suite</th>
          <th>Status</th>
          <th>Duration (s)</th>
          <th>Error Message</th>
        </tr>
      </thead>
      <tbody>
        {% for test in results %}
        <tr>
          <td><strong>{{ test.name }}</strong></td>
          <td>{{ test.suite }}</td>
          <td>
            <span class="badge {% if test.status == 'PASSED' %}badge-pass{% else %}badge-fail{% endif %}">
              {{ test.status }}
            </span>
          </td>
          <td>{{ test.duration | round(2) }}s</td>
          <td style="color: #f87171; font-size: 0.85rem;">{{ test.error or '' }}</td>
        </tr>
        {% endfor %}
      </tbody>
    </table>
  </div>
</body>
</html>
"""

def generate_reports(test_results, output_dir):
    os.makedirs(os.path.join(output_dir, "HTML"), exist_ok=True)
    os.makedirs(os.path.join(output_dir, "Summary"), exist_ok=True)

    total = len(test_results)
    passed = sum(1 for r in test_results if r["status"] == "PASSED")
    failed = total - passed
    pass_pct = round((passed / total * 100), 1) if total > 0 else 0.0

    # 1. Compile HTML Report
    template = Template(HTML_TEMPLATE)
    html_content = template.render(
        results=test_results,
        total=total,
        passed=passed,
        failed=failed,
        pass_pct=pass_pct
    )
    
    html_path = os.path.join(output_dir, "HTML", "execution-report.html")
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(html_content)
    print(f"[REPORTS] HTML Report compiled: {html_path}")

    # 2. Compile Markdown Summary (for GitHub Action Jobs page)
    md_lines = [
        "# Live GitHub Pages E2E Test Summary\n",
        f"**Deployment URL:** {os.environ.get('BASE_URL', 'https://github.io/')}\n",
        "## Overall Metrics",
        f"- **Total Tests:** {total}",
        f"- **Passed:** {passed} 🟢",
        f"- **Failed:** {failed} 🔴",
        f"- **Pass Percentage:** {pass_pct}%\n",
    ]

    if failed > 0:
        md_lines.append("## Failed Tests Details")
        for r in test_results:
            if r["status"] != "PASSED":
                md_lines.append(f"- **{r['name']}**")
                md_lines.append(f"  - *Reason:* {r.get('error', 'Unknown failure')}")
    else:
        md_lines.append("## All Tests Passed successfully! 🚀")

    md_path = os.path.join(output_dir, "Summary", "summary.md")
    with open(md_path, "w", encoding="utf-8") as f:
        f.write("\n".join(md_lines))
    print(f"[REPORTS] Markdown summary compiled: {md_path}")
