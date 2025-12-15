// This Obsidian plugin automatically links notes edited today to the daily note for the current day.

import { Plugin, TFile, Notice, Setting, PluginSettingTab } from "obsidian";

type DailyNoteLinkerSettings = {
  dailyNoteFolder: string;
};

const DEFAULT_SETTINGS: DailyNoteLinkerSettings = {
  dailyNoteFolder: "Daily Notes",
};

export default class DailyNoteLinkerPlugin extends Plugin {
  settings: DailyNoteLinkerSettings;
  modifiedFiles: Set<TFile>;

  async onload() {
    console.log("Loading Daily Note Linker Plugin");

    // Load plugin settings
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

    // Add settings tab
    this.addSettingTab(new DailyNoteLinkerSettingTab(this.app, this));

    // Register an event listener for file modification
    this.modifiedFiles = new Set();
    this.registerEvent(
      this.app.vault.on("modify", this.handleFileModified.bind(this))
    );

    // Add commands
    this.addCommand({
      id: "update-daily-note-links",
      name: "Update Daily Note Links",
      callback: () => this.writeLinksToDailyNote(),
    });

    this.addCommand({
      id: "retroactively-link-daily-notes",
      name: "Retroactively Link Daily Notes",
      callback: () => this.retroactivelyLinkDailyNotes(),
    });
  }

  async handleFileModified(file: TFile) {
    if (!file.path.endsWith(".md")) return;
    this.modifiedFiles.add(file);
  }

  async writeLinksToDailyNote() {
    const dailyNote = await this.getOrCreateDailyNote(new Date());
    if (!dailyNote) return;

    const marker = "<!-- Today you worked on: -->";
    const fileLinks = Array.from(this.modifiedFiles)
      .map(file => `- [[${file.basename}]]`)
      .join("\n");

    await this.insertLinksIntoDailyNote(dailyNote, marker, fileLinks);
    this.modifiedFiles.clear();
  }

  async retroactivelyLinkDailyNotes() {
    const allFiles = this.app.vault.getMarkdownFiles();
    const filesByDate: Record<string, TFile[]> = {};

    for (const file of allFiles) {
      const stat = await this.app.vault.adapter.stat(file.path);
      const modifiedDate = new Date(stat.mtime);
      const dateStr = `${modifiedDate.getFullYear()}-${(modifiedDate.getMonth() + 1)
        .toString()
        .padStart(2, "0")}-${modifiedDate.getDate().toString().padStart(2, "0")}`;

      if (!filesByDate[dateStr]) {
        filesByDate[dateStr] = [];
      }
      filesByDate[dateStr].push(file);
    }

    for (const [dateStr, files] of Object.entries(filesByDate)) {
      const dailyNote = await this.getOrCreateDailyNote(new Date(dateStr));
      const marker = "<!-- Today you worked on: -->";
      const fileLinks = files
        .map(file => `- [[${file.basename}]]`)
        .join("\n");

      await this.insertLinksIntoDailyNote(dailyNote, marker, fileLinks);
    }

    new Notice("Retroactive linking completed.");
  }

  async insertLinksIntoDailyNote(dailyNote: TFile, marker: string, fileLinks: string) {
    const contentToInsert = `${marker}\n${fileLinks}`;
    const dailyNoteContent = await this.app.vault.read(dailyNote);

    if (dailyNoteContent.includes(marker)) {
      const updatedContent = dailyNoteContent.replace(
        new RegExp(`${marker}\n(?:.*\n)*`, "g"),
        `${contentToInsert}\n`
      );
      await this.app.vault.modify(dailyNote, updatedContent);
    } else {
      await this.app.vault.append(dailyNote, `\n\n${contentToInsert}`);
    }
  }

  async getOrCreateDailyNote(date: Date): Promise<TFile | null> {
    const dateStr = `${date.getFullYear()}-${(date.getMonth() + 1)
      .toString()
      .padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}`;

    const dailyNotePath = this.settings.dailyNoteFolder
      ? `${this.settings.dailyNoteFolder}/${dateStr}.md`
      : `Daily Notes/${dateStr}.md`;

    let file = this.app.vault.getAbstractFileByPath(dailyNotePath) as TFile;

    if (!file) {
      await this.app.vault.create(dailyNotePath, `# ${dateStr}\n\n`);
      file = this.app.vault.getAbstractFileByPath(dailyNotePath) as TFile;
    }

    return file;
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class DailyNoteLinkerSettingTab extends PluginSettingTab {
  plugin: DailyNoteLinkerPlugin;

  constructor(app: App, plugin: DailyNoteLinkerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Daily Note Linker Settings" });

    new Setting(containerEl)
      .setName("Daily Note Folder")
      .setDesc("Specify the folder where your daily notes are stored.")
      .addText(text =>
        text
          .setPlaceholder("Daily Notes")
          .setValue(this.plugin.settings.dailyNoteFolder || "")
          .onChange(async value => {
            this.plugin.settings.dailyNoteFolder = value.trim();
            await this.plugin.saveSettings();
          })
      );
  }
}
