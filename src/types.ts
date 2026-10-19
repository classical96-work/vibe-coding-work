export interface Block { type: string; params?: unknown[]; statements?: Block[][] }
export interface Variable { id: string; name: string; value?: unknown; visible?: boolean; variableType?: string }
export interface Project { variables: Variable[]; objects: { name: string; script: Block[][] }[] }
export interface Criterion { id: number; label: string; max: number; deduction: number; reason: string; review?: string; decision?: 'accept' | 'deduct' }
export interface Grade { criteria: Criterion[]; naming: string[]; notices: string[]; acknowledged?: boolean; performance: number; base: number; total: number; reasons: string }
export interface Student { id: string; grade: number; classNo: number; number: number; name: string }
export interface Submission { key: string; fileName: string; student?: Student; grade: Grade; pseudocode: string; received: string; demo?: boolean }
export interface ScoreRow { name: string; performance?: number; base?: number; reasons?: string; submission?: Submission }
export interface Settings { base: number; rows: number; gradeLevel: number }
export interface Notebook { version: 1; settings: Settings; classes: Record<string, Record<string, ScoreRow>>; revision: number; backedUpRevision: number }
