import antfu from '@antfu/eslint-config'

export default antfu({
  formatters: true,
  rules: {
    'no-console': 'off',
    'yaml/flow-sequence-bracket-spacing': 'off',
  },
})
