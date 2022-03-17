
import {AbstractLight, AbstractOnOffOutlet} from './lights'
import {DeconzEventEmitter} from './utils'
import { Logger } from "tslog";

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
	logger: Logger

	constructor(name: string, deconz: DeconzEventEmitter, logger: Logger) {
		this.logger = logger
		this.name = name
		this.lights = {}
		this.outlets = {}
		this.default_scenes = ['morning', 'day', 'evening', 'night']
		this.active_scene = 'day'
		this.deconz = deconz
	}
	toJSON() {
		return {
			lights: this.lights,
			outlets: this.outlets,
			active_scene: this.active_scene
		}
	}
	/**
	 * Creates all the default scenes on all the defined lights
	 * @param startup_scene Scene to start with
	 */
	create_default_scenes_on_lights(startup_scene: string, lights: AbstractLight[]) {
		lights.every((light) => {
			this.logger.debug(`creating default scenes; light_name='${light.name}'`);
			this.default_scenes.every((scene_name) => {
				light.create_scene(scene_name)
			})
			//FIXME: don't issue this if light had conflicting scenes before. eg. it has been initialized by another room
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