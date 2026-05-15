// Map filename extension -> Mol* format id used by `loadStructureFromData`.
// Single source of truth: adding a new format is one entry here plus an entry
// in the `customEditors.selector` array in package.json.

export type MolstarFormat =
  | 'pdb'
  | 'mmcif'
  | 'cifCore'
  | 'mol'
  | 'mol2'
  | 'sdf'
  | 'xyz'
  | 'gro';

const EXT_TO_FORMAT: Record<string, MolstarFormat> = {
  pdb: 'pdb',
  ent: 'pdb',
  cif: 'mmcif',
  mmcif: 'mmcif',
  bcif: 'mmcif',
  mol: 'mol',
  mol2: 'mol2',
  sdf: 'sdf',
  xyz: 'xyz',
  gro: 'gro'
};

/** True if Mol* (via this extension) can render the given filename. */
export function isSupported(filename: string): boolean {
  return formatFromFilename(filename) !== undefined;
}

/** Returns the Mol* format id for a filename, or undefined if unsupported. */
export function formatFromFilename(filename: string): MolstarFormat | undefined {
  const ext = filename.toLowerCase().split('.').pop();
  return ext ? EXT_TO_FORMAT[ext] : undefined;
}

/** Binary formats are passed as Uint8Array; text formats as string. */
export function isBinaryFormat(format: MolstarFormat): boolean {
  return format === 'mmcif' && false; // bcif is binary mmcif; handled by extension below
}

/** True if the file should be transferred as bytes rather than decoded text. */
export function isBinaryExtension(filename: string): boolean {
  const ext = filename.toLowerCase().split('.').pop();
  return ext === 'bcif';
}
