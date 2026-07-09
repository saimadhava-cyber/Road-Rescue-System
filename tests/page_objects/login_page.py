from selenium.webdriver.common.by import By
from .base_page import BasePage

class LoginPage(BasePage):
    # Locators
    LOGIN_SCREEN = (By.ID, "screen-login")
    REGISTER_SCREEN = (By.ID, "screen-register")
    
    # Login Form
    EMAIL_INPUT = (By.ID, "login-email")
    PASSWORD_INPUT = (By.ID, "login-password")
    SUBMIT_BUTTON = (By.ID, "btn-login-submit")
    DEMO_BYPASS_BUTTON = (By.ID, "btn-login-demo")
    ERROR_MSG = (By.ID, "login-error-msg")
    GOTO_REGISTER_LINK = (By.XPATH, "//a[contains(text(), 'Sign Up')]")
    
    # Register Form
    REG_NAME = (By.ID, "reg-name")
    REG_EMAIL = (By.ID, "reg-email")
    REG_PASSWORD = (By.ID, "reg-password")
    REG_VEHICLE = (By.ID, "reg-vehicle")
    REG_PLATE = (By.ID, "reg-plate")
    REG_BLOOD = (By.ID, "reg-blood")
    REG_SUBMIT = (By.ID, "btn-register-submit")
    GOTO_LOGIN_LINK = (By.XPATH, "//a[contains(text(), 'Log In')]")

    def is_login_loaded(self):
        return self.find_element(self.LOGIN_SCREEN).is_displayed()

    def login(self, email, password):
        self.type(self.EMAIL_INPUT, email)
        self.type(self.PASSWORD_INPUT, password)
        self.click(self.SUBMIT_BUTTON)

    def bypass_demo(self):
        self.click(self.DEMO_BYPASS_BUTTON)

    def get_error_message(self):
        return self.get_text(self.ERROR_MSG)

    def navigate_to_register(self):
        self.click(self.GOTO_REGISTER_LINK)

    def register(self, name, email, password, vehicle, plate, blood):
        self.type(self.REG_NAME, name)
        self.type(self.REG_EMAIL, email)
        self.type(self.REG_PASSWORD, password)
        self.type(self.REG_VEHICLE, vehicle)
        self.type(self.REG_PLATE, plate)
        # Select blood type option by sending keys
        self.type(self.REG_BLOOD, blood)
        self.click(self.REG_SUBMIT)
