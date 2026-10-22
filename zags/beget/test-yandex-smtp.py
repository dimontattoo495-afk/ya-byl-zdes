#!/usr/bin/env python3
"""SAFE preflight for connecting Beget VPS to Yandex Mail SMTP.

Tests connectivity, TLS, and LOGIN only; no emails are sent and NO Auth/TP
configuration or Docker containers are changed. Never prints credentials.
Use a dedicated Yandex Mail app password, NOT the account's ordinary password.
"""
import getpass
import smtplib
import socket
import ssl
import sys

HOST = "smtp.yandex.ru"
PORT = 465
print("YANDEX SMTP TEST (read-only for Supabase, sends NO email)")
print("Enter existing Yandex Mail mailbox on Beget SSH terminal only.")
address = input("Yandex sender email: ").strip()
if not address or "@" not in address or len(address) > 254 or any(c.isspace() for c in address):
    print("STOP: invalid sender mailbox. No changes made.")
    sys.exit(2)

password = getpass.getpass("Yandex MAIL APPLICATION password (hidden): ")
if not password:
    print("STOP: empty app password. No changes made.")
    sys.exit(2)

def print_result(classification):
    print("SMTP_TEST="+classification)
    print("CONFIGURATION_CHANGED=NO")
    print("EMAIL_SENT=NO")

try:
    context = ssl.create_default_context()
    with smtplib.SMTP_SSL(HOST, PORT, timeout=15, context=context) as server:
        server.ehlo()
        # This checks only valid application credentials, never sends messages.
        server.login(address, password)
    print_result("PASS_TLS_AND_APPLICATION_PASSWORD_ACCEPTED")
except (socket.timeout, TimeoutError):
    print_result("FAIL_CONNECT_TIMEOUT")
    sys.exit(1)
except ssl.SSLError:
    print_result("FAIL_SSL_TLS_CERTIFICATE")
    sys.exit(1)
except smtplib.SMTPAuthenticationError:
    print_result("FAIL_APP_PASSWORD_OR_SMTP_PERMISSIONS")
    sys.exit(1)
except smtplib.SMTPNotSupportedError:
    print_result("FAIL_SMTP_AUTH_NOT_SUPPORTED")
    sys.exit(1)
except (smtplib.SMTPException, OSError):
    print_result("FAIL_SMTP_CONNECTION_OR_PROVIDER_ERROR")
    sys.exit(1)
finally:
    password = None
