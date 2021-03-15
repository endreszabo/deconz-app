
import { TransitionStingerCommand } from 'atem-connection/dist/commands'
import {AbstractLight, AbstractOnOffOutlet} from './lights'
import {DeconzEventEmitter} from './utils'
export class Room {
	name: string
	active_scene: string
	lights: {
		[key: string]: AbstractLight
	}
	outlets: {
		[key: string]: AbstractOnOffOutlet
	}
	default_scenes: string[]
	deconz: DeconzEventEmitter
	constructor(name: string, deconz: DeconzEventEmitter) {
		this.name = name
		this.lights = {}
		this.outlets = {}
		this.default_scenes = ['morning', 'day', 'evening', 'night']
		this.active_scene = 'day'
		this.deconz = deconz
	}
	/**
	 * Creates all the default scenes on all the defined lights
	 * @param startup_scene Scene to start with
	 */
	create_default_scenes_on_lights(startup_scene: string, lights: AbstractLight[]) {
		lights.every((light) => {
			console.log('light',light)
			this.default_scenes.every((scene_name) => {
				light.create_scene(scene_name)
			})
			//FIXME: dont issue this if light had conflicting scenes before. eg. it has been initialized by another room
			light.set_active_scene(startup_scene)
			return true
		})
	}
	set_active_scene(scene_name: string) {
		for(const[id, light] of Object.entries(this.lights)) {
			light.set_active_scene(scene_name)
		}
		this.active_scene = scene_name
	}
}