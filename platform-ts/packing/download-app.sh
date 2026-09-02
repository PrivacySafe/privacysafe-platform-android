#!/bin/bash

zip_url="$1"
app_domain="$2"
apps_dir="$3"
zip_flag="$4"

reverse_domain() {
	node -e "console.log('${1}'.split('.').reverse().join('.'));" || exit $?
}

unzipped_app_dir="$(reverse_domain $app_domain)"
zip_file="${unzipped_app_dir}.zip"

echo "Downloading $app_domain app from $zip_url"
curl --silent --show-error --fail --location "$zip_url" --output "$apps_dir/$zip_file" || exit $?

if [ "$zip_flag" == "unzip" ]
then
	echo "Unzipping $app_domain app"
	(cd "$apps_dir"
		mkdir $unzipped_app_dir || exit $?
		unzip -q -d "$unzipped_app_dir" $zip_file || exit $?
		rm $zip_file
	) || exit $?
fi
