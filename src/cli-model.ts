export interface CliEffort {
  effort: string;
  description: string;
}

/** A model a CLI offers, with the levels it accepts. An empty `defaultEffort` means the CLI picks one. */
export interface CliModel {
  slug: string;
  name: string;
  description: string;
  defaultEffort: string;
  efforts: CliEffort[];
  /** For an alias such as `opus`, the model it means today. */
  fullId?: string;
}
