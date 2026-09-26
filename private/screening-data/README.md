# Private screening data

Do not place real screening files in this Git repository.

Production data is stored in the site-wide Netlify Blobs store named
`drugscope-screening` and is read only by the authenticated
`screening-data` Function. Supported formats are `.csv`, `.txt`, `.xls`, and
`.xlsx`.

Keep local source files outside the repository, upload them with the Netlify
CLI, and never place confidential files under the public `data/` directory.
