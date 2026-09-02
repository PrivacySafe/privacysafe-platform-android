/*
 Copyright (C) 2022, 2025 - 2026 3NSoft Inc.

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


declare namespace web3n.connectivity {

	interface Connectivity {
		isOnline: () => Promise<OnlineAssesment>;
		watch: (obs: Observer<ConnectivityEvent>) => (() => void);
	}

	interface ConnectivityEvent {
		isOnline: boolean;
		wsEvent?: {
			ping?: number;
			service: 'inbox' | 'storage';
			type: 'heartbeat' | 'heartbeat-skip' | 'disconnected' | 'connected';
			slowSocket?: true;
			missingPongsFromServer?: number;
			socketClosed?: true;
			error?: any;
		};
	}

	type OnlineAssesment = 'offline_99%' | 'online_80%';

}
