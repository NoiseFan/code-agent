/* ==================== Type Constraint ==================== */

export const isObject = (val: unknown): val is object => typeof val === 'object' && val !== null

export const isString = (val: unknown): val is string => typeof val === 'string'

export const isBoolean = (val: unknown): val is boolean => typeof val === 'boolean'

export function isArray<T>(val: T): val is T & unknown[]
export function isArray(val: unknown): val is unknown[] {
  return Array.isArray(val)
}

export const isRecord = (val: unknown): val is Record<string, unknown> => isObject(val) && !isArray(val)

/* ==================== Utils ==================== */

type SerializeReplacer = ((this: unknown, key: string, value: unknown) => unknown) | (number | string)[] | null

export function serialize(value: unknown, replacer?: SerializeReplacer, space?: string | number): string {
  return JSON.stringify(value, replacer as never, space) ?? ''
}
