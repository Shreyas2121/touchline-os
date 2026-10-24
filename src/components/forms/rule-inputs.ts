export type RuleField = {
  key: string
  label: string
  kind: 'integer' | 'nullable' | 'money' | 'checkbox' | 'text'
  value: string | number | boolean | null
}

export function formText(data: FormData, name: string): string {
  return String(data.get(name) ?? '').trim()
}

export function formInteger(
  data: FormData,
  name: string,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
): number {
  const text = formText(data, name)
  const value = Number(text)
  if (
    text === '' ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  ) {
    throw new Error(`${name}: enter a whole number from ${min} to ${max}.`)
  }
  return value
}

export function formNullableInteger(
  data: FormData,
  name: string,
): number | null {
  return formText(data, name) === '' ? null : formInteger(data, name, 1)
}

export function formCompetition(data: FormData, name: string): string {
  const value = formText(data, name)
  if (value.length === 0 || value.length > 40) {
    throw new Error(`${name}: enter a competition with 1 to 40 characters.`)
  }
  return value
}

export function unreachableRule(rule: never): never {
  throw new Error(`Unsupported constitution rule: ${String(rule)}`)
}
