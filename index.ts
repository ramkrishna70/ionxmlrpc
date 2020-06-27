import { HttpClient, HttpHeaders } from '@angular/common/http';  
import xmlbuilder   from 'xmlbuilder'; 
import xml2json from 'xml-js';


export class XML_RPC { 
  private headers: HttpHeaders;
  private data = [];
  private _Server_URL;
  private _db:string;
  constructor(private http: HttpClient) {
    this.headers = new HttpHeaders({
      //'User-Agent': 'NodeJS XML-RPC Client',
      'Content-Type': 'text/xml',
      'Accept': 'text/xml',
      //'Accept-Charset': 'UTF8',
      //'Connection': 'Keep-Alive'
    });
  }

 set Server_URL(url:string) {
 	this._Server_URL = url;
 }
 set db(name:string) {
 	this._db = name;
 }
  public authenticate(username: string, password: string): Promise<any> {
    return new Promise((resolve, reject) => {
    	let payload = this.preparePayload('authenticate', [this._db, username, password, {}]);
    	let request = this.http.post(
        this._Server_URL,
        payload,
        { headers: this.headers, observe: "body", responseType: "text" }
      );
      request.subscribe(data => {
        resolve(this.xmlDeserializer(data));
      }, error => {
        reject(error.message);
      });
    });
  }

  public call_api(model: string, method: string, params: Array<any>, fields: any, uid?: number, password?: string): Promise<any> {
    let _uid: number = uid;
    let _password: string = password;
    return new Promise((resolve, reject) => {
    	let payload = this.preparePayload('execute_kw', [this._db, _uid, _password, model, method, params, fields]);
      let request = this.http.post(
        this._Server_URL,
        payload,
        { headers: this.headers, observe: "body", responseType: "text" }
      );
      request.subscribe(data => {
        let response = this.xmlDeserializer(data);
        if (response.hasOwnProperty("faultString")) {
          // error returned from backend
          reject(response.faultString);
        }
        resolve(response);
      }, error => {
        reject(error.message);
      });
    });
  }

	public preparePayload = (method, cparams) => {
		let params = cparams|| [];
		let options = { version: '1.0', allowSurrogateChars: true };
		let xml = xmlbuilder.create('methodCall', options)
  	.ele('methodName')
    .txt(method)
  	.up()
  	.ele('params');

		params.forEach((param) => {
  		this.serializeValue(param, xml.ele('param'))
		});
		return xml.doc().toString()
	}

	public serializeValue(value, xml) {
    let stack = [{
      value: value,
      xml: xml
    }];
    let current = null;
    let valueNode = null;
    let next = null;

    while (stack.length > 0) {
      current = stack[stack.length - 1];

      if (current.index !== undefined) {
        // Iterating a compound
        next = this.getNextItemsFrame(current);
        if (next) {
          stack.push(next);
        } else {
          stack.pop();
        }
      } else {
        // we're about to add a new value (compound or simple)
        valueNode = current.xml.ele('value')
        switch (typeof current.value) {
          case 'boolean':
            this.appendBoolean(current.value, valueNode);
            stack.pop();
            break
          case 'string':
            this.appendString(current.value, valueNode);
            stack.pop();
            break
          case 'number':
            this.appendNumber(current.value, valueNode);
            stack.pop();
            break
          case 'object':
            if (current.value === null) {
              valueNode.ele('nil')
              stack.pop()
            } else {
              if (Array.isArray(current.value)) {
                current.xml = valueNode.ele('array').ele('data')
              } else {
                current.xml = valueNode.ele('struct')
                current.keys = Object.keys(current.value)
              }
              current.index = 0
              next = this.getNextItemsFrame(current)
              if (next) {
                stack.push(next);
              } else {
                stack.pop();
              }
            }
            break
          default:
            stack.pop()
            break
        }
      }
    }
  }

	public getNextItemsFrame(frame) {
    let nextFrame = null

    if (frame.keys) {
      if (frame.index < frame.keys.length) {
        let key = frame.keys[frame.index++],
          member = frame.xml.ele('member').ele('name').text(key).up()
        nextFrame = {
          value: frame.value[key],
          xml: member
        }
      }
    } else if (frame.index < frame.value.length) {
      nextFrame = {
        value: frame.value[frame.index],
        xml: frame.xml
      };
      frame.index++;
    }
    return nextFrame;
  }

	public appendBoolean(value, xml) {
    xml.ele('boolean').txt(value ? 1 : 0)
	}

	public appendString(value, xml) {
		let illegalChars = /^(?![^<&]*]]>[^<&]*)[^<&]*$/;
	    if (value.length === 0) {
	        xml.ele('string')
	    } else if (!illegalChars.test(value)) {
	        xml.ele('string').d(value);
	    } else {
	        xml.ele('string').txt(value);
	    }
	}
	public appendNumber(value, xml) {
		if (value % 1 == 0) {
  		xml.ele('int').txt(value);
		}
		else {
  		xml.ele('double').txt(value);
		}
	}

	public serializeMethodResponse = (result:any) => {
		let options = { version: '1.0', allowSurrogateChars: true };
  	let xml = xmlbuilder.create('methodResponse', options)
  	.ele('params')
    		.ele('param')
		this.serializeValue(result, xml);
		// Includes the <?xml ...> declaration
		return xml.doc().toString();
	}

	public serializeFault = (fault:any) => {
		let options = { version: '1.0', allowSurrogateChars: true };
		let xml = xmlbuilder.create('methodResponse', options)
  		.ele('fault')

		this.serializeValue(fault, xml)

		// Includes the <?xml ...> declaration
		return xml.doc().toString()
	}

	public xmlDeserializer(xml:string): any {
		//console.log("xml response", xml);
		let xml2jsOptions:any = {
			compact: true,
			trim: true,
			addParent: false,
			nativeType: true,
			captureSpacesBetweenElements: false,
			instructionHasAttributes: false,
			alwaysArray: false,
			alwaysChildren: false,
			spaces: 4
		}
		let rawJsonObj = xml2json.xml2js(xml, xml2jsOptions);
    //console.log("rawJsonObj", rawJsonObj);
		let data = undefined;
    if (rawJsonObj["methodResponse"].hasOwnProperty("params")) {
      let params = rawJsonObj["methodResponse"].params;
      //console.log("params", params);
  		data = this.parseXMLToJson(params.param);
      //console.log("data from params", data);
    }
    else if (rawJsonObj["methodResponse"].hasOwnProperty("fault")) {
      let fault = rawJsonObj["methodResponse"].fault;
      //console.log("fault", fault);
  		data = this.parseXMLToJson(fault);
      //console.log("data from fault", data);
    }

    return data;

	}

	private parseXMLToJson(param: any) {
		let val = param.value;
		let keys = Object.keys(val);
		let type = keys[0];
    let data;
		switch (type) {
			case "struct":
				data = this.parseXMLToJson_struct(val[type], undefined);
				break;
			case "int":
				data = parseInt(val[type]._text);
				break;
			case "double":
				data = parseFloat(val[type]._text);
				break;
			case "string":
				data = val[type]._text.toString();
				break;
			case "boolean":
				data = Boolean(val[type]._text);
				break;
			case "array":
				data = this.parseXMLToJson_array(val[type].data);
				break;
		}
		return data;
	}

	private parseXMLToJson_struct(obj, storage=undefined) {
		if (obj.member instanceof Array) {
	 		for (let i in obj.member) {
	 			let paramName = obj.member[i].name._text;
				let value     = obj.member[i].value;

				let keys = Object.keys(value);
				let type = keys[0];

				if (typeof storage == "undefined" || storage === null) {
					storage = {};
				}
				if (!storage.hasOwnProperty(paramName)) {
					storage[paramName] = null;
				}
				switch (type) {
					case "struct":
						storage[paramName]  = this.parseXMLToJson_struct(value[type]);
						break;
					case "int":
						storage[paramName]  = parseInt(value[type]._text);
						break;
					case "double":
						storage[paramName]  = parseFloat(value[type]._text);
						break;
					case "string":
						storage[paramName]  = value[type]._text ? value[type]._text.toString() : "";
						break;
					case "boolean":
						storage[paramName]  = Boolean(value[type]._text);
						break;
					case "array":
						storage[paramName] = this.parseXMLToJson_array(value[type].data);
						break;
				}
	 		}
		}
    else if (obj.hasOwnProperty("member")) {
 			let paramName = obj.member.name._text;
			let value     = obj.member.value;


			let keys = Object.keys(value);
			let type = keys[0];


			if (typeof storage == "undefined" || storage === null) {
				storage = {};
			}
			//console.log(storage);
			if (!storage.hasOwnProperty(paramName)) {
				storage[paramName] = null;
			}
			switch (type) {
				case "struct":
					storage[paramName]  = this.parseXMLToJson_struct(value[type]);
					break;
				case "int":
					storage[paramName]  = parseInt(value[type]._text);
					break;
				case "double":
					storage[paramName]  = parseFloat(value[type]._text);
					break;
				case "string":
					storage[paramName]  = value[type]._text ? value[type]._text.toString() : "";
					break;
				case "boolean":
					storage[paramName]  = Boolean(value[type]._text);
					break;
				case "array":
					storage[paramName] = this.parseXMLToJson_array(value[type].data);
					break;
			}
		}
    else {
      storage = {};
    }
 		return storage;
	}

	private parseXMLToJson_array(obj): Array<any> {
    let storage: Array<any> = [];
    let values: Array<any> = [];
    if (obj.value instanceof Array) {
      // for more than 2 data
      values = obj.value;
    }
    else if (obj.value == undefined) {
      return storage;
    }
    else {
      // for only 1 data. This will not be enclosed in an array, thus need to explicitly
      // enclose in array
      values = [obj.value];
    }
		for (let i in values) {
				let keys = Object.keys(values[i]);
				let type = keys[0];
				switch (type) {
					case "struct":
						storage.push(this.parseXMLToJson_struct(values[i][type]))
						break;
					case "int":
						storage.push(parseInt(values[i][type]._text))
						break;
					case "double":
						storage.push(parseFloat(values[i][type]._text));
						break;
					case "string":
						storage.push(values[i][type]._text ? values[i][type]._text.toString() : "");
						break;
					case "boolean":
						storage.push(Boolean(values[i][type]._text));
						break;
				}
		}
		return storage;
	}
	public parseValue(value:string, node:string) {
		switch (node) {
			case "string":
				return value;
			break;
			case "double":
				return parseFloat(value);
			break;
			case "int":
				return parseInt(value);
			break;
			case "boolean":
				if (value.toString() == "0") {
					return "false";
				} else if (value.toString() == "1") {
					return "true";
				}
			break;
		}
	}
	public iterate(obj) {
	    for (let property in obj) {
	    	//console.log(property);
	        if (obj.hasOwnProperty(property)) {
	        	//console.log(obj[property])
	            if (typeof obj[property] == "object") {
	                this.iterate(obj[property]);
	            }
	            else {
	               console.log(property + " " + obj[property]);
	               //this.data.push({property: obj[property]})
	            }
	        }
	    }
	}
}