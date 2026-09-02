/*
 Copyright (C) 2026 3NSoft Inc.
 
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

import { stringValueType, stringArrayValueType, wrapFnOnAndroidSide } from "../runtime-ipc-via-ports";

const scanUrQRFn = wrapFnOnAndroidSide('scan_url_qr');

export async function scanUrlQR(prefixies: string[]): Promise<string|undefined> {
	const resultBytes = await scanUrQRFn(stringArrayValueType.pack({ values: prefixies }));
	return ((resultBytes.length > 0) ? stringValueType.unpack(resultBytes).value : undefined);
}
