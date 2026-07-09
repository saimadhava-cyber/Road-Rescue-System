import os
import time
import pytest
from appium import webdriver
from appium.options.android import UiAutomator2Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

from utils.excel_generator import generate_excel_report
from utils.report_generator import generate_reports

TEST_RESULTS = []

@pytest.fixture(scope="session", autouse=True)
def run_reporter():
    yield
    output_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "Test Results"))
    os.makedirs(output_dir, exist_ok=True)
    generate_excel_report(TEST_RESULTS, os.path.join(output_dir, "Excel", "Automation_Test_Report.xlsx"))
    generate_reports(TEST_RESULTS, output_dir)

@pytest.fixture
def driver():
    # Setup Appium connection capabilities
    options = UiAutomator2Options()
    options.platform_name = "Android"
    options.device_name = "Android Emulator"
    # Find APK in build output
    apk_path = os.environ.get("APK_PATH", os.path.abspath(os.path.join(
        os.path.dirname(__file__), "../../android/app/build/outputs/apk/debug/app-debug.apk"
    )))
    options.app = apk_path
    options.automation_name = "UiAutomator2"
    options.auto_grant_permissions = True
    
    driver = webdriver.Remote("http://localhost:4723/wd/hub", options=options)
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

def test_android_bypass_demo(driver):
    start_time = time.time()
    try:
        # Wait for Webview context to appear and switch to it
        time.sleep(8)
        contexts = driver.contexts
        for context in contexts:
            if "WEBVIEW" in context:
                driver.switch_to.context(context)
                break
        
        # Now we are in Webview, interact with DOM elements
        wait = WebDriverWait(driver, 15)
        demo_btn = wait.until(EC.element_to_be_clickable((By.ID, "btn-login-demo")))
        demo_btn.click()
        
        # Verify dashboard home loaded
        speed_indicator = wait.until(EC.presence_of_element_located((By.ID, "app-speed-val")))
        assert speed_indicator.text != ""
        
        log_result("Android Demo login bypass flow", "Android Appium Suite", time.time() - start_time)
    except Exception as e:
        capture_screenshot(driver, "android_demo_bypass_fail")
        log_result("Android Demo login bypass flow", "Android Appium Suite", time.time() - start_time, e)
        raise e

def test_android_manual_sos(driver):
    start_time = time.time()
    try:
        # Assume already switched to webview context from previous test (if state persisted) or switch here
        time.sleep(2)
        if driver.current_context == "NATIVE_APP":
            for context in driver.contexts:
                if "WEBVIEW" in context:
                    driver.switch_to.context(context)
                    break
                    
        wait = WebDriverWait(driver, 10)
        sos_btn = wait.until(EC.element_to_be_clickable((By.ID, "btn-trigger-sos")))
        sos_btn.click()
        
        # Verify countdown layout is active
        countdown = wait.until(EC.visibility_of_element_located((By.ID, "sos-countdown-screen")))
        assert countdown.is_displayed()
        
        # Cancel SOS
        cancel_btn = wait.until(EC.element_to_be_clickable((By.XPATH, "//button[contains(@onclick,'cancelActiveSOS')]")))
        cancel_btn.click()
        
        log_result("Android Manual SOS trigger and cancel", "Android Appium Suite", time.time() - start_time)
    except Exception as e:
        capture_screenshot(driver, "android_sos_fail")
        log_result("Android Manual SOS trigger and cancel", "Android Appium Suite", time.time() - start_time, e)
        raise e
