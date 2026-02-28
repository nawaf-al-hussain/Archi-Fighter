import { db } from "../database/database.ts";
import { BaseModel } from "./base.model.ts";
import type { Map } from "../types/types.ts"


/*
* MapModel inherits from BaseModel that has basic getters and setters
* Implement here only specifics about the class if there is some redundancy then
* it should maybe inherits from another abstract class
*/
export class MapModel extends BaseModel<Map> {

	protected table = "maps";


}

export const mapModel = new MapModel();
