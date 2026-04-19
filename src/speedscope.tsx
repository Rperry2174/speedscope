import {h, render} from 'preact'
import {ApplicationContainer} from './views/application-container'
import {ThemeProvider} from './views/themes/theme'
import {getPerfState} from './lib/perf'
import {getExperimentFlags} from './lib/runtime-config'

console.log(`speedscope v${require('../package.json').version}`)
;(window as any)['__speedscopeDebug'] = {
  getPerfState,
  getExperimentFlags,
}

/*
TODO(jlfwong): Fix this
declare const module: any
if (module.hot) {
  module.hot.dispose(() => {
    // Force the old component go through teardown steps
    render(<div />, document.body, document.body.lastElementChild || undefined)
  })
  module.hot.accept()
}
*/

render(
  <ThemeProvider>
    <ApplicationContainer />
  </ThemeProvider>,
  document.body,
  document.body.lastElementChild || undefined,
)
