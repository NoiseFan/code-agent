function switchModel() {}

function showAllRules() {}

function showAllValidator() {}

export function parseCommand(query: string): void {
  if (query.startsWith('/model'))
    switchModel()

  if (query.trim() === '/rules')
    showAllRules()

  if (query.trim() === '/validators')
    showAllValidator()
}
