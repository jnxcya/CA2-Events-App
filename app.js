const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const flash = require('connect-flash');

const app = express();

const db = mysql.createConnection({
    host: '127.0.0.1',
    user: 'root',
    password: 'RP738964$',
    database: 'eventsdb',
    ssl: {
        rejectUnauthorized: false
    }
});



db.connect((err) => {
    if (err) {
        throw err;
    }

    console.log('Connected to database');
});



app.use(express.urlencoded({ extended: false }));
app.use(express.static('public'));

app.use(
    session({
        secret: 'secret',
        resave: false,
        saveUninitialized: true,
        cookie: {
            maxAge: 1000 * 60 * 60 * 24 * 7
        }
    })
);

app.use(flash());

app.set('view engine', 'ejs');



const checkAuthenticated = (req, res, next) => {
    if (req.session.user) {
        return next();
    }

    req.flash(
        'error',
        'Please log in to view this resource'
    );

    res.redirect('/login');
};

const checkAdmin = (req, res, next) => {
    if (
        req.session.user &&
        req.session.user.role === 'admin'
    ) {
        return next();
    }

    req.flash('error', 'Access denied');
    res.redirect('/dashboard');
};



app.get('/', (req, res) => {
    res.render('index', {
        user: req.session.user,
        messages: req.flash('success')
    });
});



app.get('/register', (req, res) => {
    res.render('register', {
        messages: req.flash('error'),
        formData: req.flash('formData')[0]
    });
});

const validateRegistration = (req, res, next) => {
    const {
        username,
        email,
        password,
        address,
        contact
    } = req.body;

    if (
        !username ||
        !email ||
        !password ||
        !address ||
        !contact
    ) {
        return res
            .status(400)
            .send('All fields are required.');
    }

    if (password.length < 6) {
        req.flash(
            'error',
            'Password should be at least 6 or more characters long'
        );

        req.flash('formData', req.body);

        return res.redirect('/register');
    }

    next();
};

app.post(
    '/register',
    validateRegistration,
    (req, res) => {
        const {
            username,
            email,
            password,
            address,
            contact,
            role
        } = req.body;

        const sql = `
            INSERT INTO users
                (username, email, password, address, contact, role)
            VALUES
                (?, ?, SHA1(?), ?, ?, ?)
        `;

        db.query(
            sql,
            [
                username,
                email,
                password,
                address,
                contact,
                role
            ],
            (err, result) => {
                if (err) {
                    console.error(
                        'Registration error:',
                        err
                    );

                    return res
                        .status(500)
                        .send('Unable to register user');
                }

                console.log(result);

                req.flash(
                    'success',
                    'Registration successful! Please log in.'
                );

                res.redirect('/login');
            }
        );
    }
);



app.get('/login', (req, res) => {
    res.render('login', {
        messages: req.flash('success'),
        errors: req.flash('error')
    });
});

app.post('/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        req.flash(
            'error',
            'All fields are required.'
        );

        return res.redirect('/login');
    }

    const sql = `
        SELECT *
        FROM users
        WHERE email = ?
        AND password = SHA1(?)
    `;

    db.query(
        sql,
        [email, password],
        (err, results) => {
            if (err) {
                console.error('Login error:', err);

                return res
                    .status(500)
                    .send('Unable to log in');
            }

            if (results.length > 0) {
                req.session.user = results[0];

                req.flash(
                    'success',
                    'Login successful!'
                );

                return res.redirect('/dashboard');
            }

            req.flash(
                'error',
                'Invalid email or password.'
            );

            res.redirect('/login');
        }
    );
});



app.get(
    '/dashboard',
    checkAuthenticated,
    (req, res) => {
        res.render('dashboard', {
            user: req.session.user,
            messages: req.flash('success'),
            errors: req.flash('error')
        });
    }
);



app.get(
    '/admin',
    checkAuthenticated,
    checkAdmin,
    (req, res) => {
        res.render('admin', {
            user: req.session.user,
            messages: req.flash('success'),
            errors: req.flash('error')
        });
    }
);



app.get('/events', (req, res) => {
    const search =
        typeof req.query.search === 'string'
            ? req.query.search.trim()
            : '';

    const platform =
        typeof req.query.platform === 'string'
            ? req.query.platform.trim()
            : '';

    const eventType =
        typeof req.query.eventType === 'string'
            ? req.query.eventType.trim()
            : '';

    
    const loggedInUserId = req.session.user
        ? req.session.user.userId
        : 0;

    let sql = `
        SELECT
            e.*,

            COUNT(
                DISTINCT ep.participantId
            ) AS currentPlayers,

            MAX(
                CASE
                    WHEN ep.userId = ?
                    THEN 1
                    ELSE 0
                END
            ) AS hasJoined

        FROM events e

        LEFT JOIN event_participants ep
            ON e.eventId = ep.eventId

        WHERE (
            e.title LIKE ?
            OR e.gameName LIKE ?
            OR e.location LIKE ?
        )
    `;

    const searchValue = `%${search}%`;

    const values = [
        loggedInUserId,
        searchValue,
        searchValue,
        searchValue
    ];

    if (platform !== '') {
        sql += `
            AND e.platform = ?
        `;

        values.push(platform);
    }

    if (eventType !== '') {
        sql += `
            AND e.eventType = ?
        `;

        values.push(eventType);
    }

    sql += `
        GROUP BY e.eventId

        ORDER BY
            e.eventDate ASC,
            e.eventTime ASC
    `;

    db.query(sql, values, (err, results) => {
        if (err) {
            console.error(
                'Error retrieving events:',
                err
            );

            return res
                .status(500)
                .send('Unable to retrieve events');
        }

        res.render('events', {
            events: results,
            user: req.session.user || null,
            search,
            platform,
            eventType,
            success: req.query.success || null,
            error: req.query.error || null,
            messages: req.flash('success'),
            errors: req.flash('error')
        });
    });
});


app.post(
    '/events/:id/join',
    checkAuthenticated,
    (req, res) => {
        const eventId = Number.parseInt(
            req.params.id,
            10
        );

        const userId =
            req.session.user.userId;

        if (!Number.isInteger(eventId)) {
            return res.redirect(
                '/events?error=eventNotFound'
            );
        }

        /*
         * First, retrieve the event and count how many
         * users have already joined it.
         */
        const eventSql = `
            SELECT
                e.eventId,
                e.maxPlayers,

                COUNT(
                    ep.participantId
                ) AS currentPlayers

            FROM events e

            LEFT JOIN event_participants ep
                ON e.eventId = ep.eventId

            WHERE e.eventId = ?

            GROUP BY
                e.eventId,
                e.maxPlayers
        `;

        db.query(
            eventSql,
            [eventId],
            (eventError, eventResults) => {
                if (eventError) {
                    console.error(
                        'Error checking event:',
                        eventError
                    );

                    return res
                        .status(500)
                        .send('Database error');
                }

                if (eventResults.length === 0) {
                    return res.redirect(
                        '/events?error=eventNotFound'
                    );
                }

                const event = eventResults[0];

                /*
                 * Prevent users from joining when the
                 * maximum number of players is reached.
                 */
                if (
                    Number(event.currentPlayers) >=
                    Number(event.maxPlayers)
                ) {
                    return res.redirect(
                        '/events?error=full'
                    );
                }

                /*
                 * Check whether the user has already
                 * joined this particular event.
                 */
                const duplicateSql = `
                    SELECT participantId
                    FROM event_participants
                    WHERE eventId = ?
                    AND userId = ?
                    LIMIT 1
                `;

                db.query(
                    duplicateSql,
                    [eventId, userId],
                    (
                        duplicateError,
                        duplicateResults
                    ) => {
                        if (duplicateError) {
                            console.error(
                                'Error checking participation:',
                                duplicateError
                            );

                            return res
                                .status(500)
                                .send('Database error');
                        }

                        if (
                            duplicateResults.length > 0
                        ) {
                            return res.redirect(
                                '/events?error=alreadyJoined'
                            );
                        }

                        /*
                         * Add the user's participation
                         * record to the database.
                         */
                        const insertSql = `
                            INSERT INTO event_participants
                                (eventId, userId)
                            VALUES
                                (?, ?)
                        `;

                        db.query(
                            insertSql,
                            [eventId, userId],
                            (insertError) => {
                                if (insertError) {
                                    console.error(
                                        'Error joining event:',
                                        insertError
                                    );

                                    /*
                                     * Error 1062 is a
                                     * duplicate record.
                                     */
                                    if (
                                        insertError.errno ===
                                        1062
                                    ) {
                                        return res.redirect(
                                            '/events?error=alreadyJoined'
                                        );
                                    }

                                    return res
                                        .status(500)
                                        .send(
                                            'Unable to join event'
                                        );
                                }

                                res.redirect(
                                    '/events?success=joined'
                                );
                            }
                        );
                    }
                );
            }
        );
    }
);



app.get(
    '/joined-events',
    checkAuthenticated,
    (req, res) => {
        const userId =
            req.session.user.userId;

        const sql = `
            SELECT
                e.*,
                ep.joinedAt

            FROM event_participants ep

            INNER JOIN events e
                ON ep.eventId = e.eventId

            WHERE ep.userId = ?

            ORDER BY
                e.eventDate ASC,
                e.eventTime ASC
        `;

        db.query(
            sql,
            [userId],
            (err, results) => {
                if (err) {
                    console.error(
                        'Error retrieving joined events:',
                        err
                    );

                    return res
                        .status(500)
                        .send(
                            'Unable to retrieve joined events'
                        );
                }

                res.render('joinedEvents', {
                    events: results,
                    user: req.session.user,
                    success:
                        req.query.success || null,
                    error:
                        req.query.error || null,
                    messages:
                        req.flash('success'),
                    errors:
                        req.flash('error')
                });
            }
        );
    }
);



app.post(
    '/events/:id/leave',
    checkAuthenticated,
    (req, res) => {
        const eventId = Number.parseInt(
            req.params.id,
            10
        );

        const userId =
            req.session.user.userId;

        if (!Number.isInteger(eventId)) {
            return res.redirect(
                '/events?error=eventNotFound'
            );
        }

        const sql = `
            DELETE FROM event_participants
            WHERE eventId = ?
            AND userId = ?
        `;

        db.query(
            sql,
            [eventId, userId],
            (err, result) => {
                if (err) {
                    console.error(
                        'Error leaving event:',
                        err
                    );

                    return res
                        .status(500)
                        .send('Unable to leave event');
                }

                if (result.affectedRows === 0) {
                    return res.redirect(
                        '/events?error=notJoined'
                    );
                }

                res.redirect(
                    '/events?success=left'
                );
            }
        );
    }
);



app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error(
                'Logout error:',
                err
            );

            return res
                .status(500)
                .send('Unable to log out');
        }

        res.redirect('/');
    });
});



const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(
        `Server running on port http://localhost:${PORT}`
    );
});