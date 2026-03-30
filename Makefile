UUID = dropdown-terminal@chronolite.tech
EXTENSION_DIR = $(HOME)/.local/share/gnome-shell/extensions/$(UUID)
SCHEMA_DIR = $(EXTENSION_DIR)/schemas
ZIP_FILE = $(UUID).zip
ICON_DIR = $(HOME)/.local/share/icons/hicolor/scalable/apps
DESKTOP_DIR = $(HOME)/.local/share/applications

.PHONY: all build install uninstall clean reload enable disable

all: build

build: schemas/gschemas.compiled
	@echo "Build complete"

schemas/gschemas.compiled: schemas/org.gnome.shell.extensions.dropdown-terminal.gschema.xml
	glib-compile-schemas schemas/

install: build
	@echo "Installing extension to $(EXTENSION_DIR)"
	@mkdir -p $(EXTENSION_DIR)
	@mkdir -p $(SCHEMA_DIR)
	@mkdir -p $(ICON_DIR)
	@mkdir -p $(DESKTOP_DIR)
	@cp metadata.json $(EXTENSION_DIR)/
	@cp extension.js $(EXTENSION_DIR)/
	@cp prefs.js $(EXTENSION_DIR)/
	@cp icon.svg $(EXTENSION_DIR)/
	@cp icon.svg $(ICON_DIR)/dropdown-terminal.svg
	@cp dropdown-terminal.desktop $(DESKTOP_DIR)/
	@cp schemas/*.xml $(SCHEMA_DIR)/
	@cp schemas/gschemas.compiled $(SCHEMA_DIR)/
	@echo "Installation complete"
	@echo ""
	@echo "To enable the extension:"
	@echo "  1. Restart GNOME Shell: Log out and back in (Wayland) or press Alt+F2, type 'r', Enter (X11)"
	@echo "  2. Run: gnome-extensions enable $(UUID)"
	@echo "  3. Or use Extensions app to enable it"

uninstall:
	@echo "Removing extension from $(EXTENSION_DIR)"
	@rm -rf $(EXTENSION_DIR)
	@rm -f $(ICON_DIR)/dropdown-terminal.svg
	@rm -f $(DESKTOP_DIR)/dropdown-terminal.desktop
	@echo "Uninstall complete"

clean:
	@rm -f schemas/gschemas.compiled
	@rm -f $(ZIP_FILE)
	@echo "Clean complete"

reload:
	@echo "Reloading GNOME Shell (X11 only)..."
	@dbus-send --type=method_call --dest=org.gnome.Shell /org/gnome/Shell org.gnome.Shell.Eval string:'global.reexec_self()'

enable:
	gnome-extensions enable $(UUID)

disable:
	gnome-extensions disable $(UUID)

pack: build
	@echo "Creating extension package..."
	@rm -f $(ZIP_FILE)
	@zip -r $(ZIP_FILE) metadata.json extension.js prefs.js icon.svg schemas/
	@echo "Package created: $(ZIP_FILE)"

prefs:
	gnome-extensions prefs $(UUID)

log:
	journalctl -f -o cat /usr/bin/gnome-shell
