import '@testing-library/jest-dom'
import 'jest-axe/extend-expect'

// jsdom does not expose structuredClone even though Node has it.
if (typeof globalThis.structuredClone === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { serialize, deserialize } = require('node:v8') as typeof import('node:v8')
  globalThis.structuredClone = <T,>(value: T): T => deserialize(serialize(value)) as T
}
