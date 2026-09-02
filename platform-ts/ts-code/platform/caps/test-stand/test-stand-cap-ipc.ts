/*
 Copyright (C) 2021 - 2022, 2025 3NSoft Inc.
 
 This program is free software: you can redistribute it and/or modify it under
 the terms of the GNU General Public License as published by the Free Software
 Foundation, either version 3 of the License, or (at your option) any later
 version.
 
 This program is distributed in the hope that it will be useful, but
 WITHOUT ANY WARRANTY; without even the implied warranty of
 MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 See the GNU General Public License for more details.
 
 You should have received a copy of the GNU General Public License along with
 this program. If not, see <http://www.gnu.org/licenses/>.
*/

import { ExposedFn, Caller, ExposedObj, EnvelopeBody, serviceSideJSONWrap as jsonSrv, callerSideJSONWrap as jsonCall } from 'core-3nweb-client-lib/build/ipc';
import { Subject } from 'rxjs';
import { map } from 'rxjs/operators';
import { ProtoType, strValType, toVal, Value, toOptVal, valOfOpt } from '../../lib-common/protobuf-msg';
import { test_stand as pb } from '../../protos/test_stand.proto';

type StartupTestStand = web3n.testing.StartupTestStand;
type TestStand = web3n.testing.TestStand;

export function exposeStartupTestStandCAP(
	cap: StartupTestStand
): ExposedObj<StartupTestStand> {
	return {
		log: exposeJSONFunc(cap.log),
		record: exposeJSONFunc(cap.record),
		exitAll: exposeJSONFunc(cap.exitAll),
		staticTestInfo: exposeJSONFunc(cap.staticTestInfo),
	};
}

export function exposeTestStandCAP(cap: TestStand): ExposedObj<TestStand> {
	const exp: ExposedObj<TestStand> = {
		log: exposeJSONFunc(cap.log),
		record: exposeJSONFunc(cap.record),
		exitAll: exposeJSONFunc(cap.exitAll),
		staticTestInfo: exposeJSONFunc(cap.staticTestInfo),
		idOfTestUser: exposeJSONFunc(cap.idOfTestUser),
		sendMsgToOtherLocalTestProcess: sendMsgToOtherLocalTestProcess.wrapService(
			cap.sendMsgToOtherLocalTestProcess
		),
		// sendMsgToOtherLocalTestProcess: exposeJSONFunc(
		// 	cap.sendMsgToOtherLocalTestProcess
		// ),
		observeMsgsFromOtherLocalTestProcess: observeMsgsFromOtherLocalTestProcess.wrapService(
			cap.observeMsgsFromOtherLocalTestProcess
		),
		// observeMsgsFromOtherLocalTestProcess: jsonSrv.wrapObservingFunc(
		// 	cap.observeMsgsFromOtherLocalTestProcess
		// )
	};
	if (cap.focusThisWindow) {
		exp.focusThisWindow = exposeJSONFunc(cap.focusThisWindow);
	}
	return exp;
}

function exposeJSONFunc<F extends Function>(fn: F): ExposedFn {
	return jsonSrv.wrapReqReplyFunc(fn as any);
}

export function makeStartupTestStandCaller(
	caller: Caller, objPath: string[]
): StartupTestStand {
	return {
		log: testStartupStandCall(caller, objPath, 'log'),
		record: testStartupStandCall(caller, objPath, 'record'),
		exitAll: testStartupStandCall(caller, objPath, 'exitAll'),
		staticTestInfo: testStartupStandCall(caller, objPath, 'staticTestInfo') as StartupTestStand['staticTestInfo'],
	};
}

function testStartupStandCall<M extends keyof StartupTestStand>(
	caller: Caller, objPath: string[], method: M
): StartupTestStand[M] {
	return jsonCall.makeReqRepObjCaller<StartupTestStand, M>(
		caller, objPath, method
	);
}

export function makeTestStandCaller(
	caller: Caller, objPath: string[]
): TestStand {
	if (!caller.listObj) {
		throw new Error(`Caller here expects to have method 'listObj'`);
	}
	const methods = caller.listObj(objPath) as (keyof TestStand)[];
	return setupTestStandCaller(caller, objPath, methods);
}

export async function promiseTestStandCaller(
	caller: Caller, objPath: string[]
): Promise<TestStand> {
	if (!caller.listObjAsync) {
		throw new Error(`Caller here expects to have method 'listObjAsync'`);
	}
	const methods = (await caller.listObjAsync(objPath)) as (keyof TestStand)[];
	return setupTestStandCaller(caller, objPath, methods);
}

function setupTestStandCaller(
	caller: Caller, objPath: string[], methods: (keyof TestStand)[]
): TestStand {
	const cap: TestStand = 
	{
		log: testStandCall(caller, objPath, 'log'),
		record: testStandCall(caller, objPath, 'record'),
		exitAll: testStandCall(caller, objPath, 'exitAll'),
		staticTestInfo: testStandCall(
			caller, objPath, 'staticTestInfo'
		) as StartupTestStand['staticTestInfo'],
		idOfTestUser: testStandCall(caller, objPath, 'idOfTestUser'),
		sendMsgToOtherLocalTestProcess: sendMsgToOtherLocalTestProcess.makeCaller(
			caller, objPath
		),
		// sendMsgToOtherLocalTestProcess: testStandCall(
		// 	caller, objPath, 'sendMsgToOtherLocalTestProcess'
		// ),
		observeMsgsFromOtherLocalTestProcess:
			observeMsgsFromOtherLocalTestProcess.makeCaller(caller, objPath),
		// observeMsgsFromOtherLocalTestProcess: jsonCall.makeObservableFuncCaller(
		// 	caller, objPath.concat('observeMsgsFromOtherLocalTestProcess')
		// )
	};
	if (methods.includes('focusThisWindow')) {
		cap.focusThisWindow = testStandCall(caller, objPath, 'focusThisWindow');
	}
	return cap;
}


function testStandCall<M extends keyof TestStand>(
	caller: Caller, objPath: string[], method: M
): TestStand[M] {
	return jsonCall.makeReqRepObjCaller<TestStand, M>(caller, objPath, method);
}


function noop() {}


namespace sendMsgToOtherLocalTestProcess {

	const requestType = ProtoType.for<{
		userNum?: Value<number>;
		appDomain?: Value<string>;
		appComponent?: Value<string>;
		msgJson: string;
	}>(pb.SendMsgToOtherLocalTestProcessRequestBody);

	export function wrapService(
		fn: TestStand['sendMsgToOtherLocalTestProcess']
	): ExposedFn {
		return buf => {
			const {
				userNum, appDomain, appComponent, msgJson
			} = requestType.unpack(buf);
			const msg = JSON.parse(msgJson);
			const promise = fn(
				valOfOpt(userNum), valOfOpt(appDomain), valOfOpt(appComponent), msg
			);
			return { promise };
		}
	}

	export function makeCaller(
		caller: Caller, objPath: string[]
	): TestStand['sendMsgToOtherLocalTestProcess'] {
		const path = objPath.concat('sendMsgToOtherLocalTestProcess');
		return (userNum, appDomain, appComponent, msg) => caller.startPromiseCall(
			path,
			requestType.pack({
				userNum: toOptVal(userNum),
				appDomain: toOptVal(appDomain),
				appComponent: toOptVal(appComponent),
				msgJson: JSON.stringify(msg)
			}))
		.then(noop);
	}

}
Object.freeze(sendMsgToOtherLocalTestProcess);


namespace observeMsgsFromOtherLocalTestProcess {

	const requestType = ProtoType.for<{
		userNum?: Value<number>;
		appDomain?: Value<string>;
		appComponent?: Value<string>;
	}>(pb.ObserveOtherTestProcessRequestBody);

	export function wrapService(
		fn: TestStand['observeMsgsFromOtherLocalTestProcess']
	): ExposedFn {
		return buf => {
			const { userNum, appDomain, appComponent } = requestType.unpack(buf);
			const s = new Subject<any>();
			const obs = s.asObservable().pipe(
				map(msg => strValType.pack(toVal(JSON.stringify(msg))))
			);
			const onCancel = fn(
				s, valOfOpt(userNum), valOfOpt(appDomain), valOfOpt(appComponent)
			);
			return { obs, onCancel };
		}
	}

	export function makeCaller(
		caller: Caller, objPath: string[]
	): TestStand['observeMsgsFromOtherLocalTestProcess'] {
		const path = objPath.concat('observeMsgsFromOtherLocalTestProcess');
		return (obs, userNum, appDomain, appComponent) => {
			const s = new Subject<EnvelopeBody>();
			const unsub = caller.startObservableCall(
				path, requestType.pack({
					userNum: toOptVal(userNum),
					appDomain: toOptVal(appDomain),
					appComponent: toOptVal(appComponent)
				}), s);
			s.subscribe({
				next: buf => {
					if (obs.next) {
						obs.next(JSON.parse(strValType.unpack(buf).value));
					}
				},
				complete: obs.complete,
				error: obs.error
			});
			return unsub;
		};
	}

}
Object.freeze(observeMsgsFromOtherLocalTestProcess);


Object.freeze(exports);