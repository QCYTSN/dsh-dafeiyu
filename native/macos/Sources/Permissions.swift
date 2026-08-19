import AppKit
import ApplicationServices
import UserNotifications

/// Apple-official permission handling for the companion helper.
/// - Notifications: modern UNUserNotificationCenter (works because the helper
///   is a proper .app bundle with an Info.plist and ad-hoc signature).
/// - Accessibility: AXIsProcessTrusted / AXIsProcessTrustedWithOptions with a
///   System Settings deep link when the user asks for it.
enum Permissions {
    static func requestNotificationAuthorizationIfNeeded() {
        // UNUserNotificationCenter requires a bundle identifier; guard for
        // bare-binary development runs.
        guard Bundle.main.bundleIdentifier != nil else { return }
        let center = UNUserNotificationCenter.current()
        center.getNotificationSettings { settings in
            switch settings.authorizationStatus {
            case .notDetermined:
                center.requestAuthorization(options: [.alert, .sound]) { _, _ in }
            default:
                break
            }
        }
    }

    static var isAccessibilityTrusted: Bool {
        AXIsProcessTrusted()
    }

    /// Show the system prompt (if possible) or open System Settings.
    static func requestAccessibility() {
        let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
        if !AXIsProcessTrustedWithOptions(options) {
            openAccessibilitySettings()
        }
    }

    static func openAccessibilitySettings() {
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility") {
            NSWorkspace.shared.open(url)
        }
    }
}
