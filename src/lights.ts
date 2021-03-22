import { DeconzEventEmitter } from './utils'
import { Scene } from './scene'
import { clearTimeout, setTimeout, setInterval } from 'timers';

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
}

export class AbstractDeconzLight {
	id: string
	modelid: string
	name: string
	protected state: LightState
	type: string
	uniqueid: string
    deconz: DeconzEventEmitter

	constructor(id: string, data: any, deconz: DeconzEventEmitter) {
		this.id = id;
		this.modelid = data.modelid
		this.name = data.name
		this.modelid = data.modelid
		//this.state = data.state
		this.state = { ...data.state }
        if(this.state.on === false) {
            this.state.bri = 0
        }
		this.type = data.type
		this.uniqueid = data.uniqueid
        this.deconz = deconz

		this.wshandler = this.wshandler.bind(this);
		deconz.on(this.uniqueid, this.wshandler);
	}

	wshandler(event: any, err: any) {
		if('state' in event) {
			Object.assign(this.state, event.state)
		}
	}


	get is_on() {
		return this.state.on
	}

	get is_reachable() {
		return this.state.reachable
	}

	activateState(state: LightState) {
		this.deconz.api_put(`/lights/${this.id}/state`, state)
		let myState: LightState = state;

		if (myState.bri===0) {
			myState.on=false
		} else {
			myState.on=true
		}
		console.log(`/lights/${this.id}/state`, state)
	}

}

export class AbstractLight extends AbstractDeconzLight {
	scenes: {
		[key: string]: Scene
	}
	sceneNames: string[]

	constructor(id: string, data: any, deconz: DeconzEventEmitter) {
		super(id, data, deconz)
		this.scenes={}
		this.sceneNames=[]
		this.delete_scene = this.delete_scene.bind(this);
	}

	delete_scene(name_to_delete: string): boolean {
		let found=false; // javascript misses the for..else clause
		for(let [name, scene] of Object.entries(this.scenes)) {
			if(name===name_to_delete) {
				found=true;
				delete(this.scenes[name_to_delete])
				this.sceneNames.splice(this.sceneNames.indexOf(name),1)
				this.update()
				return true
			}
		}
		if(found === false)
			console.log("BUG: scene to be deleted cannot be found")
		return false
	}

	create_scene(name: string, timeout=0, priority=0, state?: LightState, transparent = false): boolean {
		//FIXME: reject of scene creation with the same name
//		let scene: Scene = {};
		if(name in this.scenes) {
			let scene = this.scenes[name]
			//restart its timer
			if(timeout>0) {
				clearTimeout(scene.timer)
				scene.timer = setTimeout(this.delete_scene, timeout, name)
				console.log(`scene ${name} already existed, restarted its timer`)
			} else 
				console.log(`scene ${name} already existed`)
			return false
		}
		let scene = new Scene(name, priority, transparent=transparent)
		this.scenes[name]=scene
		this.sceneNames.push(name)
		if(timeout>0)
			scene.timer = setTimeout(this.delete_scene, timeout, name)
		if(state)
			scene.lightState = state
		else {
			scene.lightState = { ...this.state }
            console.log('lightstate', scene.lightState)
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

	update() {
		let finalState: LightState = {
			bri: 0
		}
		Object.values(this.scenes).filter((scene: Scene) => {
			return scene.enabled === true
		}).sort(sortScenes).every(function(scene: Scene) {
			if(scene?.state?.bri ?? 0 > finalState.bri) {
				finalState = scene.state
			}
			return scene.transparent //will continue to next, less prioritry scene
		})
		this.activateState(finalState);
	}
}

function sortScenes(a: Scene, b: Scene) {
	/* sort scenes ascending order based on their priorities */
	if (a.priority > b.priority) {
		return -1
	} else if (a.priority < b.priority) {
		return 1
	}
	console.log(`BUG: Two active scenes have the same priority. a: ${a.name}, b: ${b.name}`);
	return 0;
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

class LidlTableLight extends AbstractLight {

}

export class AbstractOnOffOutlet extends AbstractDeconzLight {
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

export function groupsFactory(groups_object: Object, deconz: DeconzEventEmitter) {
	for(const[id, data] of Object.entries(groups_object)) {
		groups[id] = new LightGroup(id, data, deconz)
		groupsByName[data.name] = groups[id]
	}
	console.log(groups)
	console.log(groupsByName)
}

export function lightsFactory(lights_object: Object, deconz: DeconzEventEmitter) {
	for(const[id, data] of Object.entries(lights_object)) {
		process.stdout.write(".")
		switch(`${data.type}/${data.manufacturername}/${data.modelid}`) {
			case 'Extended color light/Philips/LCA001':
				lights[data.uniqueid] = new PhilipsWhiteAmbianceBulbLight(id, data, deconz)
				break;
			case 'Extended color light/Philips/LCT010':
				lights[data.uniqueid] = new PhilipsColorGamutCBulbLight(id, data, deconz)
				break;
			case 'Extended color light/Philips/LCT015':
				lights[data.uniqueid] = new PhilipsColorGamutCBulbLight(id, data, deconz)
				break;
			case 'Extended color light/innr/FL 130 C':
				lights[data.uniqueid] = new InnrLedStripLight(id, data, deconz)
				break;
			case 'On/Off plug-in unit/Heiman/TS011F':
				//outlets of this kind may have a duplicate with their uniqueid ending in -01
				outlets[data.uniqueid] = new LidlOutlet(id, data, deconz)
				break;
			case 'On/Off plug-in unit/IKEA of Sweden/TRADFRI control outlet':
				outlets[data.uniqueid] = new IkeaOutlet(id, data, deconz)
				break;
			case 'Extended color light/LIDL Livarno Lux/14149506L':
				lights[data.uniqueid] = new LidlTableLight(id, data, deconz)
				break;
			default:
				console.log(`TODO: Factory does not implement '${data.type}/${data.manufacturername}/${data.modelid}'`)
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