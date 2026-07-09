const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

class SeleniumExcelReporter {
    constructor() {
        this.results = [];
        this.startTime = new Date();
        this.outputDir = path.join(__dirname, '..', '..', 'Test Results');
        if (!process.env.REPORT_FILENAME && process.env.GITHUB_ACTIONS) {
            this.filename = 'Automation_Test_Report.xlsx';
        } else {
            this.filename = process.env.REPORT_FILENAME ? `${process.env.REPORT_FILENAME}.xlsx` : 'Automation_Test_Report.xlsx';
        }

        const excelDir = path.join(this.outputDir, 'Excel');
        if (!fs.existsSync(excelDir)) {
            fs.mkdirSync(excelDir, { recursive: true });
        }
        
        ['HTML', 'Summary', 'Logs'].forEach(dir => {
            const dirPath = path.join(this.outputDir, dir);
            if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
        });
    }

    addResult(suiteName, testName, status, durationMs, errorMessage = '') {
        this.results.push({
            suite: suiteName,
            test: testName,
            status: status,
            duration: durationMs,
            error: errorMessage,
            timestamp: new Date().toISOString()
        });
    }

    async generateReport() {
        const endTime = new Date();
        const totalDuration = ((endTime - this.startTime) / 1000).toFixed(2);

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Selenium E2E Framework';
        workbook.created = new Date();

        // ============================
        // Sheet 1: Test Execution Results
        // ============================
        const resultsSheet = workbook.addWorksheet('Test Execution Results');

        resultsSheet.columns = [
            { header: 'S.No', key: 'sno', width: 8 },
            { header: 'Test Suite', key: 'suite', width: 25 },
            { header: 'Test Case', key: 'test', width: 45 },
            { header: 'Status', key: 'status', width: 12 },
            { header: 'Duration (ms)', key: 'duration', width: 15 },
            { header: 'Error Details', key: 'error', width: 55 },
            { header: 'Timestamp', key: 'timestamp', width: 25 }
        ];

        // Style header row
        const headerRow = resultsSheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
        headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
        headerRow.height = 25;

        this.results.forEach((result, index) => {
            const row = resultsSheet.addRow({
                sno: index + 1,
                suite: result.suite,
                test: result.test,
                status: result.status,
                duration: result.duration,
                error: result.error,
                timestamp: result.timestamp
            });

            // Color code status
            const statusCell = row.getCell('status');
            if (result.status === 'PASSED') {
                statusCell.font = { bold: true, color: { argb: 'FF00B050' } };
                statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
            } else if (result.status === 'FAILED') {
                statusCell.font = { bold: true, color: { argb: 'FFFF0000' } };
                statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4EC' } };
            } else {
                statusCell.font = { bold: true, color: { argb: 'FFFFA500' } };
                statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3E0' } };
            }

            // Alternate row shading
            if (index % 2 === 0) {
                row.eachCell({ includeEmpty: true }, (cell) => {
                    if (cell.address.charAt(0) !== 'D') { // Skip status cell
                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
                    }
                });
            }
        });

        // Add borders
        resultsSheet.eachRow((row) => {
            row.eachCell((cell) => {
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
                    bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
                    left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
                    right: { style: 'thin', color: { argb: 'FFD0D0D0' } }
                };
            });
        });

        // ============================
        // Sheet 2: Summary Dashboard
        // ============================
        const summarySheet = workbook.addWorksheet('Summary Dashboard');

        const passed = this.results.filter(r => r.status === 'PASSED').length;
        const failed = this.results.filter(r => r.status === 'FAILED').length;
        const skipped = this.results.filter(r => r.status === 'SKIPPED').length;
        const total = this.results.length;
        const passRate = total > 0 ? ((passed / total) * 100).toFixed(1) : '0.0';

        summarySheet.columns = [
            { header: 'Metric', key: 'metric', width: 30 },
            { header: 'Value', key: 'value', width: 25 }
        ];

        const summaryHeaderRow = summarySheet.getRow(1);
        summaryHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        summaryHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F81BD' } };
        summaryHeaderRow.alignment = { horizontal: 'center', vertical: 'middle' };
        summaryHeaderRow.height = 25;

        const passRateNum = total > 0 ? (passed / total) * 100 : 0;
        
        let unitFailures = 0;
        this.results.forEach(r => {
            if (r.status === 'FAILED' && (r.suite.toLowerCase().includes('unit') || r.suite.toLowerCase().includes('validation'))) {
                unitFailures++;
            }
        });

        const deployableStatus = (passRateNum >= 95 && unitFailures === 0) ? 'DEPLOYABLE (🟢)' : 'BLOCKED (🔴)';

        const summaryData = [
            { metric: 'Total Test Cases', value: total },
            { metric: 'Passed', value: passed },
            { metric: 'Failed', value: failed },
            { metric: 'Skipped', value: skipped },
            { metric: 'Pass Rate (%)', value: `${passRate}%` },
            { metric: 'Deployable Status', value: deployableStatus },
            { metric: 'Unit/Validation Failures', value: unitFailures },
            { metric: 'Total Execution Time', value: `${totalDuration}s` },
            { metric: 'Execution Date', value: this.startTime.toISOString() },
            { metric: 'Browser', value: 'Google Chrome (Headless)' },
            { metric: 'Base URL', value: 'http://localhost:5000' },
            { metric: 'Framework', value: 'Selenium WebDriver, Mocha, Supertest' }
        ];

        summaryData.forEach(item => {
            const row = summarySheet.addRow(item);
            row.getCell('metric').font = { bold: true };
            if (item.metric === 'Deployable Status') {
                row.getCell('value').font = { bold: true, color: { argb: deployableStatus.includes('DEPLOYABLE') ? 'FF00B050' : 'FFFF0000' } };
            }
        });

        // Color the Passed/Failed rows
        summarySheet.getRow(3).getCell('value').font = { bold: true, color: { argb: 'FF00B050' } };
        summarySheet.getRow(4).getCell('value').font = { bold: true, color: { argb: 'FFFF0000' } };

        // Add borders to summary
        summarySheet.eachRow((row) => {
            row.eachCell((cell) => {
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
                    bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
                    left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
                    right: { style: 'thin', color: { argb: 'FFD0D0D0' } }
                };
            });
        });

        // ============================
        // Sheet 3: Suite-Level Breakdown
        // ============================
        const suiteSheet = workbook.addWorksheet('Suite Breakdown');

        suiteSheet.columns = [
            { header: 'Test Suite', key: 'suite', width: 30 },
            { header: 'Total Tests', key: 'total', width: 15 },
            { header: 'Passed', key: 'passed', width: 12 },
            { header: 'Failed', key: 'failed', width: 12 },
            { header: 'Skipped', key: 'skipped', width: 12 },
            { header: 'Pass Rate', key: 'rate', width: 15 }
        ];

        const suiteHeaderRow = suiteSheet.getRow(1);
        suiteHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        suiteHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E7D32' } };
        suiteHeaderRow.alignment = { horizontal: 'center', vertical: 'middle' };
        suiteHeaderRow.height = 25;

        // Group results by suite
        const suites = {};
        this.results.forEach(r => {
            if (!suites[r.suite]) suites[r.suite] = { total: 0, passed: 0, failed: 0, skipped: 0 };
            suites[r.suite].total++;
            if (r.status === 'PASSED') suites[r.suite].passed++;
            else if (r.status === 'FAILED') suites[r.suite].failed++;
            else suites[r.suite].skipped++;
        });

        Object.entries(suites).forEach(([name, data]) => {
            const rate = data.total > 0 ? ((data.passed / data.total) * 100).toFixed(1) : '0.0';
            suiteSheet.addRow({
                suite: name,
                total: data.total,
                passed: data.passed,
                failed: data.failed,
                skipped: data.skipped,
                rate: `${rate}%`
            });
        });

        suiteSheet.eachRow((row) => {
            row.eachCell((cell) => {
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
                    bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
                    left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
                    right: { style: 'thin', color: { argb: 'FFD0D0D0' } }
                };
            });
        });

        // Write to file
        const filePath = path.join(this.outputDir, 'Excel', this.filename);
        await workbook.xlsx.writeFile(filePath);

        // Generate HTML Report
        const htmlPath = path.join(this.outputDir, 'HTML', 'execution-report.html');
        const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Test Execution Report</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                h1 { color: #333; }
                .summary { background: #f9f9f9; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
                table { width: 100%; border-collapse: collapse; }
                th, td { padding: 10px; border: 1px solid #ddd; text-align: left; }
                th { background: #4CAF50; color: white; }
                .PASSED { color: green; font-weight: bold; }
                .FAILED { color: red; font-weight: bold; }
                .SKIPPED { color: orange; font-weight: bold; }
            </style>
        </head>
        <body>
            <h1>Test Execution Report</h1>
            <div class="summary">
                <p><strong>Total Tests:</strong> ${total}</p>
                <p><strong>Passed:</strong> ${passed}</p>
                <p><strong>Failed:</strong> ${failed}</p>
                <p><strong>Skipped:</strong> ${skipped}</p>
                <p><strong>Pass Rate:</strong> ${passRate}%</p>
                <p><strong>Duration:</strong> ${totalDuration}s</p>
            </div>
            <table>
                <tr><th>S.No</th><th>Suite</th><th>Test</th><th>Status</th><th>Duration (ms)</th><th>Error</th></tr>
                ${this.results.map((r, i) => `
                <tr>
                    <td>${i + 1}</td>
                    <td>${r.suite}</td>
                    <td>${r.test}</td>
                    <td class="${r.status}">${r.status}</td>
                    <td>${r.duration}</td>
                    <td>${r.error || '-'}</td>
                </tr>
                `).join('')}
            </table>
        </body>
        </html>
        `;
        fs.writeFileSync(htmlPath, htmlContent);

        // Generate Markdown Summary
        const mdPath = path.join(this.outputDir, 'Summary', 'summary.md');
        const failedTests = this.results.filter(r => r.status === 'FAILED');
        const failedSection = failedTests.length > 0 
            ? failedTests.map(r => `- **${r.test}**\n  Reason: ${r.error}`).join('\n')
            : 'No failed tests! 🎉';
            
        const mdContent = `
# Live GitHub Pages E2E Test Summary

**Deployment URL:** ${process.env.BASE_URL || 'http://localhost:5000'}

**Total Tests:** ${total}
**Passed:** ${passed}
**Failed:** ${failed}
**Skipped:** ${skipped}
**Pass Percentage:** ${passRate}%

### Failed Tests:
${failedSection}
        `;
        fs.writeFileSync(mdPath, mdContent.trim());

        console.log(`\n✅ Excel report generated at: ${filePath}`);
        console.log(`✅ HTML report generated at: ${htmlPath}`);
        console.log(`✅ Markdown summary generated at: ${mdPath}`);
        console.log(`   Total: ${total} | Passed: ${passed} | Failed: ${failed} | Skipped: ${skipped} | Pass Rate: ${passRate}%`);
        return filePath;
    }
}

module.exports = SeleniumExcelReporter;
