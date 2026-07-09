from selenium.webdriver.common.by import By
from .base_page import BasePage

class HomePage(BasePage):
    # Locators
    HOME_SCREEN = (By.ID, "screen-home")
    SERVICES_SCREEN = (By.ID, "screen-services")
    ACTIVITY_SCREEN = (By.ID, "screen-activity")
    CONTACTS_SCREEN = (By.ID, "screen-contacts")
    PROFILE_SCREEN = (By.ID, "screen-profile")
    
    # Navigation
    TAB_HOME = (By.XPATH, "//div[contains(@class,'nav-item')]/span[text()='Home']")
    TAB_SERVICES = (By.XPATH, "//div[contains(@class,'nav-item')]/span[text()='Services']")
    TAB_ACTIVITY = (By.XPATH, "//div[contains(@class,'nav-item')]/span[text()='Activity']")
    TAB_CONTACTS = (By.XPATH, "//div[contains(@class,'nav-item')]/span[text()='Contacts']")
    TAB_PROFILE_BTN = (By.XPATH, "//button[contains(@onclick,'profile')]")
    
    # Home Metrics
    SPEED_VAL = (By.ID, "app-speed-val")
    SAFETY_VAL = (By.ID, "app-safety-val")
    GFORCE_VAL = (By.ID, "app-gforce-val")
    BIG_SOS_BTN = (By.ID, "btn-trigger-sos")
    
    # SOS Overlay
    SOS_COUNTDOWN = (By.ID, "sos-countdown-screen")
    SOS_SECS_LEFT = (By.ID, "sos-secs-left")
    SOS_CANCEL_BTN = (By.XPATH, "//button[contains(@onclick,'cancelActiveSOS')]")
    
    # Simulator Sandbox Panel
    SIMULATOR_HEADER = (By.XPATH, "//div[contains(@class,'dash-card-title')][contains(text(),'RescueSim Sandbox')]")
    SIM_SPEED_SLIDER = (By.ID, "sim-speed")
    SIM_GFORCE_SLIDER = (By.ID, "sim-gforce")
    SIM_CRASH_HIGH = (By.ID, "btn-crash-high")
    SIM_CRASH_LOW = (By.ID, "btn-crash-low")
    
    # Diagnostics Panel
    SIM_ENGINE_CHECK = (By.ID, "sim-engine-check")
    SIM_BATTERY_SLIDER = (By.ID, "sim-battery")
    SIM_TYRE_SLIDER = (By.ID, "sim-tyre")
    SIM_BRAKE_ALERT = (By.ID, "sim-brake-alert")
    BTN_UPDATE_DIAG = (By.ID, "btn-update-diagnostics")
    
    # Hazards
    HAZARD_BTN = (By.XPATH, "//button[contains(@onclick,'openHazardModal')]")
    HAZARD_MODAL = (By.ID, "hazard-modal")
    HZ_TYPE_SELECT = (By.ID, "hz-form-type")
    HZ_DESC_INPUT = (By.ID, "hz-form-desc")
    HZ_SUBMIT_BTN = (By.XPATH, "//button[contains(@onclick,'submitRoadHazard')]")

    def go_to_tab(self, tab_name):
        if tab_name.lower() == 'home':
            self.click(self.TAB_HOME)
        elif tab_name.lower() == 'services':
            self.click(self.TAB_SERVICES)
        elif tab_name.lower() == 'activity':
            self.click(self.TAB_ACTIVITY)
        elif tab_name.lower() == 'contacts':
            self.click(self.TAB_CONTACTS)
        elif tab_name.lower() == 'profile':
            self.click(self.TAB_PROFILE_BTN)

    def trigger_sos(self):
        self.click(self.BIG_SOS_BTN)

    def cancel_sos(self):
        self.click(self.SOS_CANCEL_BTN)

    def is_sos_countdown_active(self):
        return self.find_element(self.SOS_COUNTDOWN).is_displayed()

    def get_metric_speed(self):
        return self.get_text(self.SPEED_VAL)

    def get_metric_safety(self):
        return self.get_text(self.SAFETY_VAL)

    def expand_simulator(self):
        # Simulator header toggle
        self.click(self.SIMULATOR_HEADER)

    def simulate_major_crash(self):
        self.click(self.SIM_CRASH_HIGH)

    def update_diagnostics(self, engine_check=False, battery=94, tyre=32, brake_alert=False):
        # Set engine check
        engine_checkbox = self.find_element(self.SIM_ENGINE_CHECK)
        if engine_checkbox.is_selected() != engine_check:
            engine_checkbox.click()
            
        # Set battery
        self.type(self.SIM_BATTERY_SLIDER, str(battery))
        
        # Set tyre
        self.type(self.SIM_TYRE_SLIDER, str(tyre))
        
        # Set brake alert
        brake_checkbox = self.find_element(self.SIM_BRAKE_ALERT)
        if brake_checkbox.is_selected() != brake_alert:
            brake_checkbox.click()
            
        self.click(self.BTN_UPDATE_DIAG)

    def report_hazard(self, hazard_type, description):
        self.click(self.HAZARD_BTN)
        self.type(self.HZ_TYPE_SELECT, hazard_type)
        self.type(self.HZ_DESC_INPUT, description)
        self.click(self.HZ_SUBMIT_BTN)
