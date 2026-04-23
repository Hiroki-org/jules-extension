s/(\.then((session) => {)/\1\
            if (requestVersion !== GitHubAuth.sessionRequestVersion) {\
                return undefined;\
            }\
/
