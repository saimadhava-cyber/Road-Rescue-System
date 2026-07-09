import os
import time
import pytest
from selenium import webdriver
from selenium.webdriver.chrome.options import Options

from page_objects.login_page import LoginPage
from page_objects.home_page import HomePage
from utils.excel_generator import generate_excel_report
from utils.report_generator import generate_reports

# Store results globally for compiler at end
TEST_RESULTS = []

@pytest.fixture(scope="session", autouse=True)
def run_reporter():
    yield
    # Execute after all tests run
    output_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "Test Results"))
    os.makedirs(output_dir, exist_ok=True)
    
    # Compile reports
    generate_excel_report(TEST_RESULTS, os.path.join(output_dir, "Excel", "Automation_Test_Report.xlsx"))
    generate_reports(TEST_RESULTS, output_dir)

@pytest.fixture
def driver():
    chrome_options = Options()
    chrome_options.add_argument("--headless")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--window-size=1920,1080")
    
    driver = webdriver.Chrome(options=chrome_options)
    yield driver
    driver.quit()

def log_result(name, suite, duration, error=None):
    TEST_RESULTS.append({
        "name": name,
        "suite": suite,
        "status": "FAILED" if error else "PASSED",
        "duration": duration,
        "error": str(error) if error else None
    })

def capture_screenshot(driver, name):
    scr_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "Test Results", "Screenshots"))
    os.makedirs(scr_dir, exist_ok=True)
    driver.save_screenshot(os.path.join(scr_dir, f"{name}.png"))

def test_login_demo_bypass(driver):
    base_url = os.environ.get("BASE_URL", "http://localhost:5000/")
    start_time = time.time()
    
    try:
        driver.get(base_url)
        login_page = LoginPage(driver)
        login_page.bypass_demo()
        
        home_page = HomePage(driver)
        # Check if speed indicator is visible indicating home loaded
        assert home_page.get_metric_speed() != ""
        log_result("Demo login bypass flow", "Authentication Suite", time.time() - start_time)
    except Exception as e:
        capture_screenshot(driver, "demo_login_fail")
        log_result("Demo login bypass flow", "Authentication Suite", time.time() - start_time, e)
        raise e

def test_manual_sos_trigger_and_cancel(driver):
    base_url = os.environ.get("BASE_URL", "http://localhost:5000/")
    start_time = time.time()
    
    try:
        driver.get(base_url)
        login_page = LoginPage(driver)
        login_page.bypass_demo()
        
        home_page = HomePage(driver)
        home_page.trigger_sos()
        
        # Verify countdown active
        assert home_page.is_sos_countdown_active()
        
        # Cancel SOS
        home_page.cancel_sos()
        assert not home_page.is_sos_countdown_active()
        
        log_result("Manual SOS flow", "Safety Suite", time.time() - start_time)
    except Exception as e:
        capture_screenshot(driver, "sos_trigger_fail")
        log_result("Manual SOS flow", "Safety Suite", time.time() - start_time, e)
        raise e

def test_simulate_crash(driver):
    base_url = os.environ.get("BASE_URL", "http://localhost:5000/")
    start_time = time.time()
    
    try:
        driver.get(base_url)
        login_page = LoginPage(driver)
        login_page.bypass_demo()
        
        home_page = HomePage(driver)
        home_page.go_to_tab("profile")
        home_page.expand_simulator()
        home_page.simulate_major_crash()
        
        # Verify SOS triggers immediately on severe collision
        assert home_page.is_sos_countdown_active()
        
        log_result("Simulator Crash telemetries", "Simulator Suite", time.time() - start_time)
    except Exception as e:
        capture_screenshot(driver, "simulate_crash_fail")
        log_result("Simulator Crash telemetries", "Simulator Suite", time.time() - start_time, e)
        raise e
