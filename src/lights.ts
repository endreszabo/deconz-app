import { DeconzEventEmitter, deconzLightEvent } from './utils'
import { Scene } from './scene'
import { clearTimeout, setTimeout, setInterval } from 'timers';
import { Logger } from "tslog";

export var lights:{
	[key: string]: AbstractLight
} = {}

export var groupsByName:{
	[key: string]: LightGroup
} = {}
export var groups:{
	[key: string]: LightGroup
} = {}

export var outlets :{
	[key: string]: AbstractOnOffOutlet
} = {}

export interface LightState {
	bri: number
	on?: boolean
	xy?: number[]
	colormode?: string
	ct?: number
	effect?: string
	hue?: number
	reachable?: boolean
	sat?: number
	alert?: "none"|"select"|"lselect"
	transitiontime?: number
}

export class AbstractDeconzLight {
	id: string
	modelid: string
	name: string
	protected state: LightState
	type: string
	uniqueid: string
    deconz: DeconzEventEmitter
	logger: Logger

	constructor(id: string, data: any, deconz: DeconzEventEmitter, logger: Logger) {
		this.id = id;
        this.deconz = deconz
		this.logger = logger

		//defaults
		this.name = data.name
		this.modelid = data.modelid
		this.type = data.type
		this.uniqueid = data.uniqueid
		//this.state = data.state
		this.state = { ...data.state }
        if(this.state.on === false) {
            this.state.bri = 0
        }

		this.wshandler = this.wshandler.bind(this);
		deconz.on(this.uniqueid, this.wshandler);
	}

	toJSON() {
		return {
			hue_id: this.id,
			name: this.name,
			uniqueid: this.uniqueid
		}
	}

	wshandler(event: deconzLightEvent) {
		this.logger.setSettings({requestId: event.id})
		if('state' in event.payload) {
			this.logger.debug(`light got deconz state event; light='${this.name}'`)
			this.logger.trace(`light got deconz state event; light='${this.name}'`, {event:event})
			this.logger.trace(`light object own state before; light='${this.name}'`, {state: this.state})
			Object.assign(this.state, event.payload.state)
			this.logger.trace(`light object own state after; light='${this.name}'`, {state: this.state})
		} else {
			this.logger.debug(`websocket event payload has no 'state' property, discarded`)
		}
	}


	get is_on() {
		return this.state.on
	}

	get is_reachable() {
		return this.state.reachable
	}

	activateState(state: LightState, transition: number=4) {
		let myState: LightState = state;

		if (myState.bri===0) {
			myState.on=false
		} else {
			myState.on=true
		}
		myState.transitiontime = transition
		this.deconz.api_put(`/lights/${this.id}/state`, myState)
		this.logger.debug(`Activating state: /lights/${this.id}/state ${this.name}`, state)
	}

}

export class AbstractLight extends AbstractDeconzLight {
	scenes: {
		[key: string]: Scene
	}
	sceneNames: string[]

	constructor(id: string, data: any, deconz: DeconzEventEmitter, logger: Logger) {
		super(id, data, deconz, logger)
		this.scenes={}
		this.sceneNames=[]
		this.delete_scene = this.delete_scene.bind(this);
	}

	toJSON() {
		return Object.assign(super.toJSON(), {
			scenes: this.scenes,
			state: this.state
		})
	}

	delete_scene(name_to_delete: string): boolean {
		let found=false; // javascript misses the for..else clause
		for(let [name, scene] of Object.entries(this.scenes)) {
			if(name===name_to_delete) {
				found=true;
				//TOOD: consider this to prevent further actions to fire
				//clearTimeout(this.scenes[name_to_delete].timer)
				this.logger.debug('deleting scene', {scene: scene})
				delete(this.scenes[name_to_delete])
				this.sceneNames.splice(this.sceneNames.indexOf(name),1)
				this.update()
				//this.scenes[name_to_delete].transitionOut)
				return true
			}
		}
		if(found === false)
			this.logger.debug(`scene to be deleted cannot be found; scene_name='${name_to_delete}`)
		return false
	}

	/**
	 * Creates a scene for the light 
	 * @param name  Name of scene
	 * @param timeout  Timeout in minutes
	 * @param priority  Prioirty, higher takes precedence
	 * @param state  State object to be PUT on API
	 * @param transparent  Continue with processing lower precedence scenes that has higher bri
	 */
	create_scene(name: string, timeout=0, priority=0, state?: LightState, transparent = false): boolean {
		//FIXME: reject of scene creation with the same name
//		let scene: Scene = {};
		if(name in this.scenes) {
			let scene = this.scenes[name]
			//restart its timer
			if(timeout>0) {
				clearTimeout(scene.timer)
				scene.timer = setTimeout(this.delete_scene, timeout*60000, name)
				this.logger.debug(`scene already exists, restarting its timer; scene_name='${name}`)
			} else 
				this.logger.debug(`scene already exists; scene_name='${name}`)
			return false
		}
		let scene = new Scene(name, priority, transparent=transparent)
		this.scenes[name]=scene
		this.sceneNames.push(name)
		if(timeout>0)
			scene.timer = setTimeout(this.delete_scene, timeout*60000, name)
		if(state)
			scene.lightState = state
		else {
			this.logger.trace(`scene state before state merge; scene_name='${name}`, {state: scene.lightState})
			scene.lightState = { ...this.state }
			this.logger.trace(`scene state after state merge; scene_name='${name}`, {state: scene.lightState})
        }
		return true
	}

	set_active_scene(scene_name: string) {
		//FIXME: check is scene exists. raise error if not
		for(let [name, scene] of Object.entries(this.scenes)) {
			// special scenes will not be hurt
			if (scene.name[0] !== '_')
				scene.enabled = name === scene_name
		}
		this.update()
	}

	update(transition = 4) {
		let finalState: LightState = {
			bri: 0
		}
		Object.values(this.scenes).filter((scene: Scene) => {
			return scene.enabled === true
		}).sort(sortScenes).every(function(scene: Scene) {
			if(scene.state.bri > finalState.bri) {
				finalState = scene.state
			}
			return scene.transparent //will continue to next, less prioritry scene
		})
		this.activateState(finalState, transition);
	}
}

function sortScenes(a: Scene, b: Scene) {
	/* sort scenes ascending order based on their priorities */
	if (a.priority > b.priority) {
		return -1
	} else if (a.priority < b.priority) {
		return 1
	}
	console.warn(`two active scenes have the same priority; scene_a='${a.name}', scene_b='${b.name}'`);
	return 0;
}

class PhilipsLedStripLight extends AbstractLight {
}
class InnrLedStripLight extends AbstractLight {
}

class PhilipsWhiteAmbianceBulbLight extends AbstractLight {
	activateState(state: LightState) {
		let myState: LightState = state;
		if (myState.bri===0) {
			myState.on=false
		} else {
			myState.on=true
		}
		super.activateState(myState)
	}
}

class PhilipsColorGamutCBulbLight extends AbstractLight {
	activateState(state: LightState) {
		let myState: LightState = state;
		if (myState.bri===0) {
			myState.on=false
		} else {
			myState.on=true
		}
		super.activateState(myState)
	}
}

class IkeaE27WW806lm extends AbstractLight {
	activateState(state: LightState) {
		let myState: LightState = state;
		if (myState.bri===0) {
			myState.on=false
		} else {
			myState.on=true
		}
		super.activateState(myState)
	}
}

class LidlTableLight extends AbstractLight { }

class LidlE27ColorLight extends AbstractLight { }

export class AbstractOnOffOutlet extends AbstractDeconzLight {
	activateState(state: LightState) {
		this.deconz.api_put(`/lights/${this.id}/state`, state)
	}
	toJSON() {
		return Object.assign(super.toJSON(), {
			switched_on: this.state.on
		})
	}
	switch_on() {
		this.state.on=true
		this.update()
	}
	switch_off() {
		this.state.on=false
		this.update()
	}
	update() {
		this.activateState(this.state)
	}
}

class LidlOutlet extends AbstractOnOffOutlet {
}
class IkeaOutlet extends AbstractOnOffOutlet {
}

export function groupsFactory(groups_object: Object, deconz: DeconzEventEmitter, logger: Logger) {
	for(const[id, data] of Object.entries(groups_object)) {
		groups[id] = new LightGroup(id, data, deconz)
		groupsByName[data.name] = groups[id]
	}
}

export function lightsFactory(lights_object: Object, deconz: DeconzEventEmitter, logger: Logger) {
	for(const[id, data] of Object.entries(lights_object)) {
		process.stdout.write(".")
		switch(`${data.type}/${data.manufacturername}/${data.modelid}`) {
			case 'Extended color light/Philips/LCA001':
				//fixme ez nem annyita ambiance szerintem
				lights[data.uniqueid] = new PhilipsWhiteAmbianceBulbLight(id, data, deconz, logger.getChildLogger({ name: data.name }))
				break;
			case 'Color temperature light/Philips/LTW010':
				lights[data.uniqueid] = new PhilipsWhiteAmbianceBulbLight(id, data, deconz, logger.getChildLogger({ name: data.name }))
				break;
			case 'Extended color light/Philips/LCT010':
				lights[data.uniqueid] = new PhilipsColorGamutCBulbLight(id, data, deconz, logger.getChildLogger({ name: data.name }))
				break;
			case 'Extended color light/Philips/LCT015':
				lights[data.uniqueid] = new PhilipsColorGamutCBulbLight(id, data, deconz, logger.getChildLogger({ name: data.name }))
				break;
			case 'Extended color light/Philips/LST002':
				lights[data.uniqueid] = new PhilipsLedStripLight(id, data, deconz, logger.getChildLogger({ name: data.name }))
				break;
			case 'Extended color light/innr/FL 130 C':
				lights[data.uniqueid] = new InnrLedStripLight(id, data, deconz, logger.getChildLogger({ name: data.name }))
				break;
			case 'Dimmable light/IKEA of Sweden/TRADFRI bulb E27 WW 806lm':
				lights[data.uniqueid] = new IkeaE27WW806lm(id, data, deconz, logger.getChildLogger({ name: data.name }))
				break;
			case 'On/Off plug-in unit/Heiman/TS011F':
				//outlets of this kind may have a duplicate with their uniqueid ending in -01
				outlets[data.uniqueid] = new LidlOutlet(id, data, deconz, logger.getChildLogger({ name: data.name }))
				break;
			case 'On/Off plug-in unit/IKEA of Sweden/TRADFRI control outlet':
				outlets[data.uniqueid] = new IkeaOutlet(id, data, deconz, logger.getChildLogger({ name: data.name }))
				break;
			case 'Extended color light/Heiman/TS0505A':
				lights[data.uniqueid] = new LidlE27ColorLight(id, data, deconz, logger.getChildLogger({ name: data.name }))
				break;
			case 'Extended color light/LIDL Livarno Lux/14149506L':
				lights[data.uniqueid] = new LidlTableLight(id, data, deconz, logger.getChildLogger({ name: data.name }))
				break;
			default:
				logger.warn(`TODO: Factory does not implement '${data.type}/${data.manufacturername}/${data.modelid}'`)
		}
	}
}

export interface LightGroupMembers {
	[key: string]: AbstractLight
}

export interface LightGroupState {
	all_on: boolean
	any_on: boolean
}

class LightGroup {
	name: string
	state: LightGroupState
	id: string
	lights: AbstractLight[]
	deconz: DeconzEventEmitter

	constructor(id: string, data: any, deconz: DeconzEventEmitter) {
		this.lights = Object.values(lights).filter((light) => {
			return data.lights.indexOf(light.id)>=0
		});
		this.name=data.name
		this.id=id
		this.state=data.state
		this.deconz = deconz
	}

	activate(state: LightState) {
		this.deconz.api_put(`/groups/${this.id}/action`, state)
	}

	get_members() {
		return this.lights
	}
}