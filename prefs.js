import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import { t, getLanguage } from './i18n.js';

export default class SystemFloatingMonitorPreferences extends ExtensionPreferences {

    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        window.set_default_size(540, 450);

        const page = new Adw.PreferencesPage({
            icon_name: 'preferences-system-symbolic',
        });
        window.add(page);

        // ── Group: Update ─────────────────────────────────────────────────────
        const updateGroup = new Adw.PreferencesGroup();
        page.add(updateGroup);

        const intervalRow = new Adw.SpinRow({
            adjustment: new Gtk.Adjustment({
                lower: 1, upper: 60,
                step_increment: 1, page_increment: 5,
                value: settings.get_int('refresh-interval'),
            }),
        });
        settings.bind('refresh-interval', intervalRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        updateGroup.add(intervalRow);

        // ── Group: Alerts ─────────────────────────────────────────────────────
        const alertGroup = new Adw.PreferencesGroup();
        page.add(alertGroup);

        const thresholdRow = new Adw.SpinRow({
            adjustment: new Gtk.Adjustment({
                lower: 50, upper: 99,
                step_increment: 1, page_increment: 5,
                value: settings.get_int('alert-threshold'),
            }),
        });
        settings.bind('alert-threshold', thresholdRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        alertGroup.add(thresholdRow);

        const cooldownRow = new Adw.SpinRow({
            adjustment: new Gtk.Adjustment({
                lower: 10, upper: 600,
                step_increment: 10, page_increment: 60,
                value: settings.get_int('alert-cooldown'),
            }),
        });
        settings.bind('alert-cooldown', cooldownRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        alertGroup.add(cooldownRow);

        // ── Group: Language ───────────────────────────────────────────────────
        const languageGroup = new Adw.PreferencesGroup();
        page.add(languageGroup);

        const languageRow = new Adw.ComboRow({
            model: new Gtk.StringList({
                strings: ['System Default / Mặc định', 'English', 'Tiếng Việt']
            }),
        });
        languageGroup.add(languageRow);

        const langKeys = ['auto', 'en', 'vi'];
        const currentLang = settings.get_string('language');
        let selectedIndex = langKeys.indexOf(currentLang);
        if (selectedIndex === -1) selectedIndex = 0;
        languageRow.selected = selectedIndex;

        const langNotifyId = languageRow.connect('notify::selected', () => {
            const index = languageRow.selected;
            settings.set_string('language', langKeys[index]);
        });

        // ── Update translations dynamically ────────────────────────────────────
        const updatePrefsStrings = () => {
            const lang = getLanguage(settings);
            page.title = t(lang, 'general');
            
            updateGroup.title = t(lang, 'update_settings');
            updateGroup.description = t(lang, 'update_settings_desc');
            
            intervalRow.title = t(lang, 'refresh_interval');
            intervalRow.subtitle = t(lang, 'refresh_interval_desc');

            alertGroup.title = t(lang, 'alert_settings');
            alertGroup.description = t(lang, 'alert_settings_desc');

            thresholdRow.title = t(lang, 'alert_threshold');
            thresholdRow.subtitle = t(lang, 'alert_threshold_desc');

            cooldownRow.title = t(lang, 'alert_cooldown');
            cooldownRow.subtitle = t(lang, 'alert_cooldown_desc');

            languageGroup.title = t(lang, 'language');
            languageGroup.description = t(lang, 'language_desc');
            languageRow.title = t(lang, 'language');
            languageRow.subtitle = t(lang, 'language_desc');
        };

        const changedId = settings.connect('changed::language', updatePrefsStrings);
        
        window.connect('destroy', () => {
            if (changedId) {
                settings.disconnect(changedId);
            }
            if (languageRow && langNotifyId) {
                languageRow.disconnect(langNotifyId);
            }
        });

        updatePrefsStrings();
    }
}
