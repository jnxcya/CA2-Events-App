const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const flash = require('connect-flash');
const router = express.Router();

const app = express();

// const db = mysql.createConnection({
//     host: '127.0.0.1',
//     user: 'root',
//     password: 'RP738964$',
//     database: 'eventsdb',
//     ssl: {
//         rejectUnauthorized: false
//     }
// });

// [C237-020] Database connection to Azure MySQL Database
const db = mysql.createConnection({
    host: 'c237-annie-mysql.mysql.database.azure.com',
    user: 'c237_020',
    password: 'c237020@2026!',
    database: 'c237_020_ca2team4',
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



app.get('/dashboard', checkAuthenticated, (req, res) => {

    const userId = req.session.user.userId;

    const createdSql = `
        SELECT COUNT(*) AS totalCreated
        FROM events
        WHERE createdBy = ?
    `;

    const joinedSql = `
        SELECT COUNT(*) AS totalJoined
        FROM event_participants
        WHERE userId = ?
    `;

    const upcomingSql = `
        SELECT *
        FROM events
        WHERE createdBy = ?
        AND eventDate >= CURDATE()
        ORDER BY eventDate ASC
        LIMIT 5
    `;

    db.query(createdSql, [userId], (err, createdResult) => {

        if (err) return res.status(500).send(err);

        db.query(joinedSql, [userId], (err, joinedResult) => {

            if (err) return res.status(500).send(err);

            db.query(upcomingSql, [userId], (err, upcomingResult) => {

                if (err) return res.status(500).send(err);

                res.render('dashboard', {

                    user: req.session.user,

                    totalCreated: createdResult[0].totalCreated,

                    totalJoined: joinedResult[0].totalJoined,

                    upcomingEvents: upcomingResult

                });

            });

        });

    });

});

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

app.get('/admin/users', (req, res) => {

    const sql = 'SELECT * FROM users';

    db.query(sql, (err, results) => {

        if (err) throw err;

        res.render('users', {
            users: results
        });

    });

});

app.get('/admin/deleteUser/:id', (req, res) => {

    const userId = req.params.id;

    const sql = 'DELETE FROM users WHERE userId = ?';

    connection.query(sql, [userId], (err) => {

        if (err) throw err;

        res.redirect('/admin/users');

    });

});

app.get('/admin/manageevents', (req, res) => {

    const sql = `
        SELECT events.*, users.username
        FROM events
        LEFT JOIN users
        ON events.createdBy = users.userId
        ORDER BY eventDate DESC
    `;

    db.query(sql, (err, events) => {

        if (err) throw err;

        res.render('manageevents', {
            events: events
        });

    });

});

app.get('/admin/deleteEvent/:id', (req, res) => {

    const eventId = req.params.id;

    const deleteParticipants =
        'DELETE FROM event_participants WHERE eventId = ?';

    const deleteEvent =
        'DELETE FROM events WHERE eventId = ?';

    db.query(deleteParticipants, [eventId], (err) => {

        if (err) throw err;

        db.query(deleteEvent, [eventId], (err) => {

            if (err) throw err;

            res.redirect('/admin/manageevents');

        });

    });

});

const validateEvent = (req, res, next) => {
    const redirectTo = req.params.id
        ? `/events/${req.params.id}/edit`
        : '/events/add';

    const {
        title, gameName, platform, eventType,
        eventDate, eventTime, maxPlayers
    } = req.body;

    if (!title || !gameName || !platform || !eventType ||
        !eventDate || !eventTime || !maxPlayers) {
        req.flash('error', 'Please fill in all required fields.');
        req.flash('formData', req.body);
        return res.redirect(redirectTo);
    }

    const players = Number.parseInt(maxPlayers, 10);

    if (!Number.isInteger(players) || players < 2 || players > 100) {
        req.flash('error', 'Max players must be a whole number between 2 and 100.');
        req.flash('formData', req.body);
        return res.redirect(redirectTo);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (new Date(eventDate) < today) {
        req.flash('error', 'Event date cannot be in the past.');
        req.flash('formData', req.body);
        return res.redirect(redirectTo);
    }

    next();
};

// add events
app.get('/events/add', checkAuthenticated, (req, res) => {
    res.render('addEvent', {
        user: req.session.user,
        errors: req.flash('error'),
        formData: req.flash('formData')[0]
    });
});

app.post('/events/add', checkAuthenticated, validateEvent, (req, res) => {
    const {
        title, gameName, platform, eventType,
        eventDate, eventTime, location, maxPlayers, description
    } = req.body;

    const sql = `
        INSERT INTO events
            (title, gameName, platform, eventType,
             eventDate, eventTime, location, maxPlayers,
             description, createdBy)
        VALUES
            (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(
        sql,
        [
            title, gameName, platform, eventType,
            eventDate, eventTime, location || null,
            Number.parseInt(maxPlayers, 10),
            description || null,
            req.session.user.userId
        ],
        (err) => {
            if (err) {
                console.error('Error creating event:', err);
                return res.status(500).send('Unable to create event');
            }
            res.redirect('/events?success=created');
        }
    );
});


//view events

app.get('/my-events', checkAuthenticated, (req, res) => {
    const sql = `
        SELECT
            e.*,
            COUNT(ep.participantId) AS currentPlayers

        FROM events e

        LEFT JOIN event_participants ep
            ON e.eventId = ep.eventId

        WHERE e.createdBy = ?

        GROUP BY e.eventId

        ORDER BY
            e.eventDate ASC,
            e.eventTime ASC
    `;

    db.query(sql, [req.session.user.userId], (err, results) => {
        if (err) {
            console.error('Error retrieving your events:', err);
            return res.status(500).send('Unable to retrieve your events');
        }

        res.render('myEvents', {
            events: results,
            user: req.session.user,
            success: req.query.success || null,
            error: req.query.error || null
        });
    });
});


//edit events

app.get('/events/:id/edit', checkAuthenticated, (req, res) => {
    const eventId = Number.parseInt(req.params.id, 10);

    if (!Number.isInteger(eventId)) {
        return res.redirect('/my-events?error=eventNotFound');
    }

    db.query(
        'SELECT * FROM events WHERE eventId = ?',
        [eventId],
        (err, results) => {
            if (err) {
                console.error('Error retrieving event:', err);
                return res.status(500).send('Database error');
            }

            if (results.length === 0) {
                return res.redirect('/my-events?error=eventNotFound');
            }

            const event = results[0];
            const isOwner = event.createdBy === req.session.user.userId;
            const isAdmin = req.session.user.role === 'admin';

            if (!isOwner && !isAdmin) {
                return res.redirect('/events?error=notAllowed');
            }

            res.render('editEvent', {
                user: req.session.user,
                event,
                errors: req.flash('error'),
                formData: req.flash('formData')[0]
            });
        }
    );
});

app.post('/events/:id/edit', checkAuthenticated, validateEvent, (req, res) => {
    const eventId = Number.parseInt(req.params.id, 10);

    const {
        title, gameName, platform, eventType,
        eventDate, eventTime, location, maxPlayers, description
    } = req.body;

    db.query(
        'SELECT createdBy FROM events WHERE eventId = ?',
        [eventId],
        (err, results) => {
            if (err || results.length === 0) {
                return res.redirect('/my-events?error=eventNotFound');
            }

            const isOwner = results[0].createdBy === req.session.user.userId;
            const isAdmin = req.session.user.role === 'admin';

            if (!isOwner && !isAdmin) {
                return res.redirect('/events?error=notAllowed');
            }

            const sql = `
                UPDATE events
                SET title = ?, gameName = ?, platform = ?, eventType = ?,
                    eventDate = ?, eventTime = ?, location = ?,
                    maxPlayers = ?, description = ?
                WHERE eventId = ?
            `;

            db.query(
                sql,
                [
                    title, gameName, platform, eventType,
                    eventDate, eventTime, location || null,
                    Number.parseInt(maxPlayers, 10),
                    description || null,
                    eventId
                ],
                (updateError) => {
                    if (updateError) {
                        console.error('Error updating event:', updateError);
                        return res.status(500).send('Unable to update event');
                    }

                    res.redirect('/my-events?success=updated');
                }
            );
        }
    );
});

//delete events
app.post('/events/:id/delete', checkAuthenticated, (req, res) => {
    const eventId = Number.parseInt(req.params.id, 10);

    if (!Number.isInteger(eventId)) {
        return res.redirect('/my-events?error=eventNotFound');
    }

    db.query(
        'SELECT createdBy FROM events WHERE eventId = ?',
        [eventId],
        (err, results) => {
            if (err) {
                console.error('Error checking event owner:', err);
                return res.status(500).send('Database error');
            }

            if (results.length === 0) {
                return res.redirect('/my-events?error=eventNotFound');
            }

            const isOwner = results[0].createdBy === req.session.user.userId;
            const isAdmin = req.session.user.role === 'admin';

            if (!isOwner && !isAdmin) {
                return res.redirect('/events?error=notAllowed');
            }
            db.query(
                'DELETE FROM event_participants WHERE eventId = ?',
                [eventId],
                (participantError) => {
                    if (participantError) {
                        console.error(
                            'Error removing participants:',
                            participantError
                        );

                        return res.status(500).send('Database error');
                    }

                    db.query(
                        'DELETE FROM events WHERE eventId = ?',
                        [eventId],
                        (deleteError) => {
                            if (deleteError) {
                                console.error('Error deleting event:', deleteError);
                                return res.status(500).send('Unable to delete event');
                            }

                            res.redirect('/my-events?success=deleted');
                        }
                    );
                }
            );
        }
    );
});



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

                if (
                    Number(event.currentPlayers) >=
                    Number(event.maxPlayers)
                ) {
                    return res.redirect(
                        '/events?error=full'
                    );
                }
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

// statistics
app.get('/statistics', checkAuthenticated, (req, res) => {

    const totalUsersSql = `
        SELECT COUNT(*) AS totalUsers
        FROM users
    `;

    const totalEventsSql = `
        SELECT COUNT(*) AS totalEvents
        FROM events
    `;

    const gameSql = `
        SELECT gameName,
               COUNT(*) AS total
        FROM events
        GROUP BY gameName
        ORDER BY total DESC
    `;

    const platformSql = `
        SELECT platform,
               COUNT(*) AS total
        FROM events
        GROUP BY platform
    `;

    const popularSql = `
        SELECT
            e.title,
            COUNT(ep.userId) AS participants

        FROM events e

        LEFT JOIN event_participants ep

        ON e.eventId = ep.eventId

        GROUP BY e.eventId

        ORDER BY participants DESC
    `;

    db.query(totalUsersSql, (err, users) => {

        if (err) return res.status(500).send(err);

        db.query(totalEventsSql, (err, events) => {

            if (err) return res.status(500).send(err);

            db.query(gameSql, (err, games) => {

                if (err) return res.status(500).send(err);

                db.query(platformSql, (err, platforms) => {

                    if (err) return res.status(500).send(err);

                    db.query(popularSql, (err, popular) => {

                        if (err) return res.status(500).send(err);

                        res.render('statistics', {

                            user: req.session.user,

                            totalUsers: users[0].totalUsers,

                            totalEvents: events[0].totalEvents,

                            games,

                            platforms,

                            popular

                        });

                    });

                });

            });

        });

    });

});

// profile
app.get('/profile', checkAuthenticated, (req, res) => {

    const sql = `
        SELECT *
        FROM users
        WHERE userId = ?
    `;

    db.query(sql, [req.session.user.userId], (err, results) => {

        if (err) {

            console.error(err);

            return res.status(500).send("Database Error");

        }

        res.render('profile', {

            user: req.session.user,

            userData: results[0]

        });

    });

});

// edit profile
app.get('/profile/edit', checkAuthenticated, (req, res) => {

    const sql = `
        SELECT *
        FROM users
        WHERE userId = ?
    `;

    db.query(sql, [req.session.user.userId], (err, results) => {

        if (err) return res.status(500).send(err);

        res.render('editProfile', {

            user: req.session.user,

            userData: results[0]

        });

    });

});


app.post('/profile/edit', checkAuthenticated, (req, res) => {

    const {

        username,

        email,

        address,

        contact

    } = req.body;

    const sql = `
        UPDATE users

        SET

        username=?,

        email=?,

        address=?,

        contact=?

        WHERE userId=?
    `;

    db.query(

        sql,

        [

            username,

            email,

            address,

            contact,

            req.session.user.userId

        ],

        (err) => {

            if (err) return res.status(500).send(err);

            req.session.user.username = username;

            res.redirect('/profile');

        }

    );

});

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
