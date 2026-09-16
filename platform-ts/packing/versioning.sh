#!/bin/bash

get_from_json() {
	local json_file="$1"
	local url="$2"
	if [ -n "$json_file" ]
	then
		local json_str_src="
			fs.readFileSync('$json_file', { encoding: 'utf8' })
		"
	elif [ -n "$url" ]
	then
		local json_str_src="
			child_process.execSync('curl -s -f "$url"', { encoding: 'utf-8' })
		"
	else
		echo "Neither file nor url given for json" 1>&2
		return 1
	fi
	shift 2
	local fields=""
	for field in $@
	do
		fields="$fields['$field']"
	done
	node -e "
		const json = JSON.parse($json_str_src);
		const val = json$fields;
		if ((typeof val === 'string') && (val.length > 0)) {
			console.log(val);
		} else if (Array.isArray(val)) {
			console.log(val.join(' '));
		} else {
			throw new Error(
				\"Configuration json file has invalid field $fields\"
			);
		}
	" || return $?
}

get_from_json_file() {
	local json_file="$1"
	shift 1
	get_from_json "$json_file" "" $@ || return $?
}

get_from_remote_json() {
	local url="$1"
	shift 1
	get_from_json "" "$url" $@ || return $?
}

BASE_URL='https://3nsoft.com/downloads'

app_url() {
	local brand="$1"
	local app_domain="$2"
	echo "${BASE_URL}/${brand}/3nweb-apps/${app_domain}"
}

app_zip_url() {
	local brand="$1"
	local app_domain="$2"
	local version="$3"
	echo "$(app_url $brand $app_domain)/$version/${app_domain}-${version}.zip"
}

get_latest_version_in_channel() {
	local base_url="$1"
	local channel="$2"
	local latest_url="$base_url/$channel.latest"
	node -e "
		try {
			console.log(JSON.parse(child_process.execSync(
				'curl -s -f "$latest_url"', { encoding: 'utf-8' }
			)));
		} catch (err) {}
	" || return $?
}

get_app_latest_version_in_channel() {
	local brand="$1"
	local app_domain="$2"
	local channel="$3"
	get_latest_version_in_channel "$(app_url $brand $app_domain)" $channel || return $?
}
