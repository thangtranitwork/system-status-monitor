import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class SystemFloatingMonitorPreferences extends ExtensionPreferences {

    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        window.set_default_size(540, 400);

        const page = new Adw.PreferencesPage({
            title: 'General',
            icon_name: 'preferences-system-symbolic',
        });
        window.add(page);

        // ── Group: Update ─────────────────────────────────────────────────────
        const updateGroup = new Adw.PreferencesGroup({
            title: 'Update Settings',
            description: 'Configure how often system stats are refreshed',
        });
        page.add(updateGroup);

        const intervalRow = new Adw.SpinRow({
            title: 'Refresh Interval',
            subtitle: 'Seconds between each CPU & RAM update (1 – 60)',
            adjustment: new Gtk.Adjustment({
                lower: 1, upper: 60,
                step_increment: 1, page_increment: 5,
                value: settings.get_int('refresh-interval'),
            }),
        });
        settings.bind('refresh-interval', intervalRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        updateGroup.add(intervalRow);

        // ── Group: Alerts ─────────────────────────────────────────────────────
        const alertGroup = new Adw.PreferencesGroup({
            title: 'Alert Settings',
            description: 'Get notified when CPU or RAM is running high',
        });
        page.add(alertGroup);

        const thresholdRow = new Adw.SpinRow({
            title: 'Alert Threshold',
            subtitle: 'Send notification when usage exceeds this % (50 – 99)',
            adjustment: new Gtk.Adjustment({
                lower: 50, upper: 99,
                step_increment: 1, page_increment: 5,
                value: settings.get_int('alert-threshold'),
            }),
        });
        settings.bind('alert-threshold', thresholdRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        alertGroup.add(thresholdRow);

        const cooldownRow = new Adw.SpinRow({
            title: 'Alert Cooldown',
            subtitle: 'Minimum seconds between repeated alerts (10 – 600)',
            adjustment: new Gtk.Adjustment({
                lower: 10, upper: 600,
                step_increment: 10, page_increment: 60,
                value: settings.get_int('alert-cooldown'),
            }),
        });
        settings.bind('alert-cooldown', cooldownRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        alertGroup.add(cooldownRow);
    }
}
