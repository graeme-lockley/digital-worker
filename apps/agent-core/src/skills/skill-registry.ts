import {
  formatSkillsForPrompt,
  loadSkillsFromDir,
  type Skill,
} from "@earendil-works/pi-coding-agent";

export class SkillRegistry {
  private skills: Skill[] = [];

  constructor(private readonly directory: string) {}

  async refresh(): Promise<Skill[]> {
    const result = loadSkillsFromDir({
      dir: this.directory,
      source: "workspace",
    });
    this.skills = result.skills;
    return this.skills;
  }

  list(): Skill[] {
    return [...this.skills];
  }

  formatForPrompt(): string {
    return formatSkillsForPrompt(this.skills);
  }
}
