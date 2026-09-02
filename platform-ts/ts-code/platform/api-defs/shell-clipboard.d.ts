/*
 Copyright (C) 2025 3NSoft Inc.

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


declare namespace web3n.shell.clipboard {

	interface Clipboard {

		/**
		 * Returns the content in the clipboard as plain text.
		 * @param type Can be selection or clipboard; default is 'clipboard'. selection is only available on Linux.
		 */
		readText(type?: ClippingsSource): Promise<string>;

		/**
		 * Writes the text into the clipboard as plain text.
		 * @param text 
		 * @param type Can be selection or clipboard; default is 'clipboard'. selection is only available on Linux.
		 */
		writeText(text: string, type?: ClippingsSource): Promise<void>;

		/**
		 * Returns the content in the clipboard as markup.
		 * @param type Can be selection or clipboard; default is 'clipboard'. selection is only available on Linux.
		 */
		readHTML(type?: ClippingsSource): Promise<string>;

		/**
		 * Writes the markup into the clipboard.
		 * @param markup 
		 * @param type Can be selection or clipboard; default is 'clipboard'. selection is only available on Linux.
		 */
		writeHTML(markup: string, type?: ClippingsSource): Promise<void>;

		/**
		 * Returns the content in the clipboard as RTF.
		 * @param type Can be selection or clipboard; default is 'clipboard'. selection is only available on Linux.
		 */
		readRTF(type?: ClippingsSource): Promise<string>;

		/**
		 * Writes the text into the clipboard in RTF.
		 * @param text 
		 * @param type Can be selection or clipboard; default is 'clipboard'. selection is only available on Linux.
		 */
		writeRTF(text: string, type?: ClippingsSource): Promise<void>;

	}

	type ClippingsSource = 'clipboard' | 'selection';

}
