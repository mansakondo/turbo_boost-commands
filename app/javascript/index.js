import '@turbo-boost/streams'
import './turbo'
import schema from './schema'
import { dispatch, commandEvents, stateEvents } from './events'
import activity from './activity'
import delegates from './delegates'
import drivers from './drivers'
import meta from './meta'
import elements from './elements'
import lifecycle from './lifecycle'
import logger from './logger'
import state from './state'
import urls from './urls'
import uuids from './uuids'

function buildCommandPayload (id, element) {
  return {
    id, // uniquely identifies the command
    name: element.getAttribute(schema.commandAttribute),
    elementId: element.id.length > 0 ? element.id : null,
    elementAttributes: elements.buildAttributePayload(element),
    startedAt: Date.now()
  }
}

function invokeCommand (event) {
  let element
  let payload = {}

  try {
    element = elements.findClosestCommand(event.target)
    if (!element) return
    if (!delegates.isRegisteredForElement(event.type, element)) return

    const commandId = `turbo-command-${uuids.v4()}`
    let driver = drivers.find(element)
    let payload = {
      ...buildCommandPayload(commandId, element),
      driver: driver.name,
      frameId: driver.frame ? driver.frame.id : null,
      src: driver.src
    }

    const startEvent = dispatch(commandEvents.start, element, {
      cancelable: true,
      detail: payload
    })

    if (startEvent.defaultPrevented)
      return dispatch(commandEvents.abort, element, {
        detail: {
          message: `An event handler for '${commandEvents.start}' prevented default behavior and blocked command invocation!`,
          source: startEvent
        }
      })

    // the element and thus the driver may have changed based on the start event handler(s)
    driver = drivers.find(element)
    payload = {
      ...buildCommandPayload(commandId, element),
      driver: driver.name,
      frameId: driver.frame ? driver.frame.id : null,
      src: driver.src
    }

    activity.add(payload)

    if (['frame', 'window'].includes(driver.name)) event.preventDefault()

    meta.busy = true
    setTimeout(() => (meta.busy = false), 10)

    switch (driver.name) {
      case 'method':
        return driver.invokeCommand(element, payload)
      case 'form':
        return driver.invokeCommand(element, payload)
      case 'frame':
        return driver.invokeCommand(driver.frame, payload)
      case 'window':
        return driver.invokeCommand(payload)
    }
  } catch (error) {
    dispatch(commandEvents.clientError, element, {
      detail: { ...payload, error }
    })
  }
}

// wire things up and setup defaults for event delegation
delegates.handler = invokeCommand
delegates.register('click', [`[${schema.commandAttribute}]`])
delegates.register('submit', [`form[${schema.commandAttribute}]`])
delegates.register('change', [
  `input[${schema.commandAttribute}]`,
  `select[${schema.commandAttribute}]`,
  `textarea[${schema.commandAttribute}]`
])

self.TurboBoost = self.TurboBoost || {}

self.TurboBoost = {
  ...self.TurboBoost,

  stateEvents,

  get state () {
    return state.current
  },

  get stateDelta () {
    return state.delta
  }
}

self.TurboBoost.Commands = {
  logger,
  schema,
  events: commandEvents,
  registerEventDelegate: delegates.register,
  get eventDelegates () {
    return delegates.events
  }
}

export default self.TurboBoost.Commands
