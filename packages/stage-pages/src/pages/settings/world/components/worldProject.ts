/** Existing creation metadata exposed to Personal World project UI. */
export interface WorldProjectCreation {
  id: string
  title: string
  url: string | null
  prompt?: string
  createdAt: number
}
